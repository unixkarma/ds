// POST /api/openings/generate
//   Generates openings from a template for the given instructor on the given dates.
//   Each slot is validated against:
//     - instructor weekly availability for that day_of_week (must fit inside a window)
//     - existing openings for that instructor (no overlap)
//     - existing scheduled lessons for that instructor (no overlap; respects buffer + travel-time)
//   Slots that fail validation are silently skipped and reported back in `skipped`.

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { estimateTravelMinutes } from '@/lib/travel-time'
import type { OpeningTemplate, OpeningTemplateSlot } from '@/types'

const generateSchema = z.object({
  templateId: z.string().uuid(),
  instructorId: z.string().uuid(),
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(31),
})

interface SkipReport {
  date: string
  start: string
  reason: string
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('role, school_id')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.role !== 'admin' && profile.role !== 'instructor')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = generateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { templateId, instructorId, dates } = parsed.data
  const schoolId = profile.school_id

  // ── Validate ownership ──
  const { data: template } = await supabase
    .from('opening_templates')
    .select('*')
    .eq('id', templateId)
    .eq('school_id', schoolId)
    .single<OpeningTemplate>()

  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }

  const { data: instructorRow } = await supabase
    .from('instructors')
    .select('id, user_id, buffer_minutes')
    .eq('id', instructorId)
    .eq('school_id', schoolId)
    .single()

  if (!instructorRow) {
    return NextResponse.json({ error: 'Instructor not found' }, { status: 404 })
  }

  if (profile.role === 'instructor' && instructorRow.user_id !== user.id) {
    return NextResponse.json(
      { error: 'Instructors can only generate openings for themselves.' },
      { status: 403 }
    )
  }

  const bufferMinutes: number = instructorRow.buffer_minutes ?? 0

  // ── Pre-fetch the data we need to validate against ──
  // 1. Availability windows for ALL relevant days_of_week
  const dayMap: Record<string, number> = {} // YYYY-MM-DD → day_of_week
  for (const d of dates) dayMap[d] = new Date(d + 'T00:00:00').getDay()
  const uniqueDows = Array.from(new Set(Object.values(dayMap)))

  const { data: availability } = await supabase
    .from('availability')
    .select('day_of_week, start_time, end_time')
    .eq('instructor_id', instructorId)
    .in('day_of_week', uniqueDows)

  const availabilityByDow = new Map<number, { start: number; end: number }[]>()
  for (const a of availability ?? []) {
    const [sh, sm] = a.start_time.split(':').map(Number)
    const [eh, em] = a.end_time.split(':').map(Number)
    const list = availabilityByDow.get(a.day_of_week) ?? []
    list.push({ start: sh * 60 + sm, end: eh * 60 + em })
    availabilityByDow.set(a.day_of_week, list)
  }

  // 2. Existing openings for this instructor in the requested date range
  const minDate = dates.reduce((a, b) => (a < b ? a : b))
  const maxDate = dates.reduce((a, b) => (a > b ? a : b))
  const rangeStart = new Date(minDate + 'T00:00:00').toISOString()
  const rangeEnd = new Date(maxDate + 'T23:59:59.999Z').toISOString()

  const { data: existingOpenings } = await supabase
    .from('openings')
    .select('scheduled_at, duration_minutes')
    .eq('instructor_id', instructorId)
    .gte('scheduled_at', rangeStart)
    .lte('scheduled_at', rangeEnd)

  // 3. Existing scheduled lessons for the instructor in the same range
  const { data: existingLessons } = await supabase
    .from('lessons')
    .select('scheduled_at, duration_minutes, pickup_location, dropoff_location')
    .eq('instructor_id', instructorId)
    .eq('status', 'scheduled')
    .gte('scheduled_at', rangeStart)
    .lte('scheduled_at', rangeEnd)

  const openingRanges = (existingOpenings ?? []).map(o => {
    const start = new Date(o.scheduled_at).getTime()
    return { start, end: start + o.duration_minutes * 60 * 1000 }
  })

  const lessonRanges = (existingLessons ?? []).map(l => {
    const start = new Date(l.scheduled_at).getTime()
    return {
      start,
      end: start + l.duration_minutes * 60 * 1000,
      pickup: l.pickup_location as string | null,
      dropoff: l.dropoff_location as string | null,
    }
  })

  // ── Build candidate slots ──
  const slots = template.slots as OpeningTemplateSlot[]
  const toInsert: { school_id: string; instructor_id: string; template_id: string; scheduled_at: string; duration_minutes: number }[] = []
  const skipped: SkipReport[] = []

  for (const date of dates) {
    const dow = dayMap[date]
    const windows = availabilityByDow.get(dow) ?? []

    for (const slot of slots) {
      const [h, m] = slot.start.split(':').map(Number)
      const slotStartMin = h * 60 + m
      const slotEndMin = slotStartMin + slot.duration_min

      // (a) must fit inside one of the availability windows
      const fitsInAvail = windows.some(w => slotStartMin >= w.start && slotEndMin <= w.end)
      if (!fitsInAvail) {
        skipped.push({ date, start: slot.start, reason: 'outside availability' })
        continue
      }

      const scheduledAt = new Date(`${date}T${slot.start.padStart(5, '0')}:00`)
      const slotStartMs = scheduledAt.getTime()
      const slotEndMs = slotStartMs + slot.duration_min * 60 * 1000

      // (b) no overlap with existing openings
      const openingClash = openingRanges.some(r => r.start < slotEndMs && r.end > slotStartMs)
      if (openingClash) {
        skipped.push({ date, start: slot.start, reason: 'duplicate opening' })
        continue
      }

      // (c) no overlap with existing lessons
      const lessonOverlap = lessonRanges.some(r => r.start < slotEndMs && r.end > slotStartMs)
      if (lessonOverlap) {
        skipped.push({ date, start: slot.start, reason: 'lesson overlap' })
        continue
      }

      // (d) buffer + travel-time vs neighboring lessons same day
      const sameDayLessons = lessonRanges.filter(r => {
        const rd = new Date(r.start).toISOString().slice(0, 10)
        return rd === date
      })

      const prev = sameDayLessons
        .filter(r => r.end <= slotStartMs)
        .sort((a, b) => b.end - a.end)[0]
      const next = sameDayLessons
        .filter(r => r.start >= slotEndMs)
        .sort((a, b) => a.start - b.start)[0]

      if (prev) {
        const gapMin = Math.round((slotStartMs - prev.end) / 60000)
        const travel = estimateTravelMinutes(prev.dropoff, null) // opening has no pickup yet
        const required = Math.max(travel ?? 0, bufferMinutes)
        if (required > 0 && gapMin < required) {
          skipped.push({ date, start: slot.start, reason: 'too close after lesson' })
          continue
        }
      }

      if (next) {
        const gapMin = Math.round((next.start - slotEndMs) / 60000)
        const travel = estimateTravelMinutes(null, next.pickup)
        const required = Math.max(travel ?? 0, bufferMinutes)
        if (required > 0 && gapMin < required) {
          skipped.push({ date, start: slot.start, reason: 'too close before lesson' })
          continue
        }
      }

      toInsert.push({
        school_id: schoolId,
        instructor_id: instructorId,
        template_id: templateId,
        scheduled_at: scheduledAt.toISOString(),
        duration_minutes: slot.duration_min,
      })
    }
  }

  // ── Insert ──
  let created: { id: string }[] = []
  if (toInsert.length > 0) {
    const adminClient = createAdminClient()
    const { data, error } = await adminClient
      .from('openings')
      .insert(toInsert)
      .select('id')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    created = data ?? []
  }

  return NextResponse.json({
    createdCount: created.length,
    skippedCount: skipped.length,
    skipped,
  })
}
