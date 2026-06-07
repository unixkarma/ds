// Openings generator — single source of truth for "what openings should exist".
//
// Given an instructor and a window (default: today → +14 days), this function:
//   1. Wipes ALL `available` openings in the window for that instructor.
//   2. Rebuilds them from: instructor's templates (own + school defaults) ∩ days,
//      minus instructor_days_off, minus times occupied by booked/blocked openings
//      or scheduled lessons.
//
// `booked` and `blocked` openings are NEVER touched — they survive every regeneration.
// Lessons are never touched either — they're just respected as conflicts.
//
// Called from:
//   - opening_templates POST/PATCH/DELETE (schedule changed)
//   - instructor_days_off POST/DELETE (exception added/removed)
//   - daily Vercel cron (slide the 14-day window forward)
//   - student claim/cancel flows (Phase D — to be added)

import { createAdminClient } from '@/lib/supabase/admin'
import type { OpeningTemplate, OpeningTemplateSlot } from '@/types'

export interface RegenerateResult {
  instructorId: string
  deleted: number
  created: number
}

interface RegenerateOptions {
  instructorId: string
  schoolId: string
  windowDays?: number  // default 14
}

function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function regenerateOpenings({
  instructorId,
  schoolId,
  windowDays = 14,
}: RegenerateOptions): Promise<RegenerateResult> {
  const admin = createAdminClient()

  // Window: [today 00:00 local, today + windowDays 00:00 local)
  // Server runs in TZ=America/Chicago (see instrumentation.ts) so this is CT.
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const horizon = new Date(today)
  horizon.setDate(today.getDate() + windowDays)

  // 1. Wipe all `available` openings in the window.
  const { data: deletedRows } = await admin
    .from('openings')
    .delete()
    .eq('instructor_id', instructorId)
    .eq('status', 'available')
    .gte('scheduled_at', today.toISOString())
    .lt('scheduled_at', horizon.toISOString())
    .select('id')

  // 2. Templates that auto-apply for this instructor.
  // School defaults (instructor_id IS NULL) are starters/inspiration only — they do NOT
  // auto-apply. Instructors must "use as starter" to clone them into instructor-scoped
  // templates, which then auto-apply.
  const { data: templates } = await admin
    .from('opening_templates')
    .select('*')
    .eq('school_id', schoolId)
    .eq('instructor_id', instructorId)

  const tpls = (templates ?? []) as OpeningTemplate[]

  // 3. Days off in window — only APPROVED days off block the schedule.
  //    Pending requests await admin approval; rejected ones never apply.
  const { data: daysOff } = await admin
    .from('instructor_days_off')
    .select('date')
    .eq('instructor_id', instructorId)
    .eq('status', 'approved')
    .gte('date', toDateKey(today))
    .lt('date', toDateKey(horizon))

  const daysOffSet = new Set((daysOff ?? []).map(d => d.date as string))

  // 4. Untouchable conflicts (booked/blocked openings + scheduled lessons)
  // Each occupied range is inflated by `± buffer_minutes` so a slot directly
  // adjacent to a lesson — but with no breathing room — won't be published as
  // an opening (the booking endpoint would 409 it anyway).
  const [{ data: instructorRow }, { data: nonAvailableOpenings }, { data: lessons }] = await Promise.all([
    admin
      .from('instructors')
      .select('buffer_minutes')
      .eq('id', instructorId)
      .single(),
    admin
      .from('openings')
      .select('scheduled_at, duration_minutes')
      .eq('instructor_id', instructorId)
      .in('status', ['booked', 'blocked'])
      .gte('scheduled_at', today.toISOString())
      .lt('scheduled_at', horizon.toISOString()),
    admin
      .from('lessons')
      .select('scheduled_at, duration_minutes')
      .eq('instructor_id', instructorId)
      .eq('status', 'scheduled')
      .gte('scheduled_at', today.toISOString())
      .lt('scheduled_at', horizon.toISOString()),
  ])

  const bufferMs = ((instructorRow?.buffer_minutes ?? 0) as number) * 60_000

  const occupied: { start: number; end: number }[] = []
  for (const o of nonAvailableOpenings ?? []) {
    const s = new Date(o.scheduled_at).getTime()
    occupied.push({ start: s - bufferMs, end: s + o.duration_minutes * 60_000 + bufferMs })
  }
  for (const l of lessons ?? []) {
    const s = new Date(l.scheduled_at).getTime()
    occupied.push({ start: s - bufferMs, end: s + l.duration_minutes * 60_000 + bufferMs })
  }

  // 5. Build the desired slot set
  const toInsert: {
    school_id: string
    instructor_id: string
    template_id: string
    scheduled_at: string
    duration_minutes: number
  }[] = []
  const dedupe = new Set<string>()  // `${dateKey}|${HH:MM}` — no two openings at same time

  for (let i = 0; i < windowDays; i++) {
    const day = new Date(today)
    day.setDate(today.getDate() + i)
    const dateKey = toDateKey(day)

    if (daysOffSet.has(dateKey)) continue

    const dow = day.getDay()
    const applicable = tpls.filter(t => (t.day_of_week as number[] | undefined)?.includes(dow))

    for (const tpl of applicable) {
      for (const slot of tpl.slots as OpeningTemplateSlot[]) {
        const key = `${dateKey}|${slot.start}`
        if (dedupe.has(key)) continue
        dedupe.add(key)

        const scheduledAt = new Date(`${dateKey}T${slot.start.padStart(5, '0')}:00`)
        const slotStart = scheduledAt.getTime()
        const slotEnd = slotStart + slot.duration_min * 60_000

        const conflict = occupied.some(r => r.start < slotEnd && r.end > slotStart)
        if (conflict) continue

        toInsert.push({
          school_id: schoolId,
          instructor_id: instructorId,
          template_id: tpl.id,
          scheduled_at: scheduledAt.toISOString(),
          duration_minutes: slot.duration_min,
        })
      }
    }
  }

  // 6. Bulk insert
  let created = 0
  if (toInsert.length > 0) {
    const { data: inserted, error } = await admin
      .from('openings')
      .insert(toInsert)
      .select('id')
    if (error) throw new Error(`regenerateOpenings insert failed: ${error.message}`)
    created = inserted?.length ?? 0
  }

  return {
    instructorId,
    deleted: deletedRows?.length ?? 0,
    created,
  }
}

// Helper: regenerate for every active instructor in a school.
// Used by school-level template changes (admin) and the daily cron.
export async function regenerateAllInstructorsInSchool(
  schoolId: string,
  windowDays = 14
): Promise<RegenerateResult[]> {
  const admin = createAdminClient()
  const { data: instructors } = await admin
    .from('instructors')
    .select('id')
    .eq('school_id', schoolId)
    .eq('is_active', true)

  const results: RegenerateResult[] = []
  for (const inst of instructors ?? []) {
    const r = await regenerateOpenings({
      instructorId: inst.id,
      schoolId,
      windowDays,
    })
    results.push(r)
  }
  return results
}
