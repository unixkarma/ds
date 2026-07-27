// GET  /api/lessons?start=ISO&end=ISO — fetch lessons for calendar
// POST /api/lessons                  — create a new lesson (with conflict detection)

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { estimateTravelMinutes } from '@/lib/travel-time'

// ── GET ───────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const start = searchParams.get('start')
  const end = searchParams.get('end')

  if (!start || !end) {
    return NextResponse.json({ error: 'start and end are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('lessons')
    .select(`
      *,
      student:students(*, user:users!user_id(*)),
      instructor:instructors(*, user:users(*)),
      vehicle:vehicles(*)
    `)
    .gte('scheduled_at', start)
    .lt('scheduled_at', end)
    .order('scheduled_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ lessons: data })
}

// ── POST ──────────────────────────────────────────────────────
// Two booking modes:
//  1. openingId provided  → student claims a published opening; we trust the opening
//     for time/duration/instructor and just CAS-flip it to 'booked'.
//  2. no openingId        → admin/instructor free-form booking; runs full conflict +
//     travel checks against existing lessons.
const createLessonSchema = z.object({
  studentId: z.string().uuid(),
  instructorId: z.string().uuid().optional(),
  lessonType: z.enum(['regular', 'road_test']).default('regular'),
  scheduledAt: z.string().datetime().optional(),
  durationMinutes: z.number().int().min(15).max(240).default(60),
  openingId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().nullable().optional(),
  notesCovered: z.string().max(150).optional(),
  notesPractice: z.string().max(150).optional(),
  notesAdditional: z.string().max(150).optional(),
  pickupLocation: z.string().optional(),
  dropoffLocation: z.string().optional(),
  soldBy: z.enum(['school', 'instructor']).optional(),
})

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('role, school_id')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'instructor', 'student'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = createLessonSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { studentId, vehicleId, lessonType, notesCovered, notesPractice, notesAdditional, pickupLocation, dropoffLocation, soldBy, openingId } = parsed.data
  const schoolId = profile.school_id

  // ── Resolve booking source (opening vs free-form) ───────────
  // When openingId is provided we trust it as the source of truth for
  // instructor + time + duration. Otherwise we fall back to the body fields.
  let instructorId = parsed.data.instructorId
  let scheduledAt = parsed.data.scheduledAt
  let durationMinutes = parsed.data.durationMinutes

  if (openingId) {
    const { data: opening } = await supabase
      .from('openings')
      .select('id, school_id, instructor_id, scheduled_at, duration_minutes, status')
      .eq('id', openingId)
      .single()

    if (!opening || opening.school_id !== schoolId) {
      return NextResponse.json({ error: 'Opening not found.' }, { status: 404 })
    }
    if (opening.status !== 'available') {
      return NextResponse.json(
        { error: 'This opening is no longer available.' },
        { status: 409 }
      )
    }

    instructorId = opening.instructor_id
    scheduledAt = opening.scheduled_at
    durationMinutes = opening.duration_minutes
  }

  if (!instructorId || !scheduledAt) {
    return NextResponse.json(
      { error: 'instructorId and scheduledAt are required when no openingId is provided.' },
      { status: 400 }
    )
  }

  // Determine sold_by: instructors creating lessons = 'instructor', otherwise 'school'
  const resolvedSoldBy = soldBy ?? (profile.role === 'instructor' ? 'instructor' : 'school')

  // Fetch school settings for booking limit and pricing
  const { data: school } = await supabase
    .from('schools')
    .select('max_booking_days_ahead, single_lesson_price_cents')
    .eq('id', schoolId)
    .single()

  // Enforce max booking days ahead
  if (school) {
    const maxDate = new Date()
    maxDate.setDate(maxDate.getDate() + school.max_booking_days_ahead)
    if (new Date(scheduledAt) > maxDate) {
      return NextResponse.json(
        { error: `Cannot book more than ${school.max_booking_days_ahead} days in advance.` },
        { status: 400 }
      )
    }
  }

  // Fetch instructor for pricing + buffer. Must belong to the caller's school —
  // otherwise an admin/instructor could book against a foreign-tenant instructor
  // by passing its id (IDOR).
  const { data: instructorRecord } = await supabase
    .from('instructors')
    .select('modality, hourly_rate_cents, lesson_price_cents, commission_rate, buffer_minutes')
    .eq('id', instructorId)
    .eq('school_id', schoolId)
    .single()

  if (!instructorRecord) {
    return NextResponse.json({ error: 'Instructor not found' }, { status: 404 })
  }

  // Calculate price_cents for this lesson
  const hours = durationMinutes / 60
  let priceCents = 0
  if (instructorRecord) {
    if (instructorRecord.modality === 'independent' && instructorRecord.lesson_price_cents) {
      priceCents = Math.round(instructorRecord.lesson_price_cents * hours)
    } else if (school) {
      priceCents = Math.round(school.single_lesson_price_cents * hours)
    }
  }

  // The target student must belong to the caller's school. Guards admin/
  // instructor callers passing a studentId from another tenant (IDOR).
  const { data: studentSchool } = await supabase
    .from('students')
    .select('id')
    .eq('id', studentId)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!studentSchool) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 })
  }

  // Students can only book lessons for themselves
  if (profile.role === 'student') {
    const { data: studentRecord } = await supabase
      .from('students')
      .select('id, lessons_remaining')
      .eq('user_id', user!.id)
      .single()

    if (!studentRecord) {
      return NextResponse.json({ error: 'Student record not found' }, { status: 404 })
    }
    if (studentRecord.id !== studentId) {
      return NextResponse.json({ error: 'You can only book lessons for yourself' }, { status: 403 })
    }
    if (studentRecord.lessons_remaining <= 0) {
      return NextResponse.json(
        { error: 'No lessons remaining. Please purchase a package first.' },
        { status: 400 }
      )
    }
  }

  const lessonStart = new Date(scheduledAt)
  const lessonEnd = new Date(lessonStart.getTime() + durationMinutes * 60 * 1000)

  // ── Auto-link to a matching opening (admin/instructor free-form) ─
  // If the caller didn't pass openingId but their (instructor, scheduled_at,
  // duration) exactly matches a published opening for that instructor, treat
  // the booking as a claim — link it and CAS-flip below. Keeps the openings
  // table accurate without requiring the admin UI to know about openings.
  let matchedOpeningId: string | null = null
  if (!openingId) {
    const { data: exact } = await supabase
      .from('openings')
      .select('id')
      .eq('instructor_id', instructorId)
      .eq('scheduled_at', scheduledAt)
      .eq('duration_minutes', durationMinutes)
      .eq('status', 'available')
      .maybeSingle()
    if (exact) matchedOpeningId = exact.id
  }
  const effectiveOpeningId = openingId ?? matchedOpeningId

  // ── Conflict detection ──────────────────────────────────────
  // Always check for actual lesson overlaps. The opening flag doesn't bypass
  // this — if a real lesson exists, the booking must fail (the DB exclusion
  // constraints would catch it anyway, but we want a friendly 409).
  const dayStart = new Date(lessonStart)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)

  const { data: existingLessons } = await supabase
    .from('lessons')
    .select('id, scheduled_at, duration_minutes, instructor_id, student_id, pickup_location, dropoff_location')
    .eq('school_id', schoolId)
    .eq('status', 'scheduled')
    .gte('scheduled_at', dayStart.toISOString())
    .lt('scheduled_at', dayEnd.toISOString())

  for (const ex of existingLessons ?? []) {
    const exStart = new Date(ex.scheduled_at)
    const exEnd = new Date(exStart.getTime() + ex.duration_minutes * 60 * 1000)

    // Check overlap: [exStart, exEnd) overlaps [lessonStart, lessonEnd)
    const overlaps = exStart < lessonEnd && exEnd > lessonStart

    if (overlaps) {
      if (ex.instructor_id === instructorId) {
        return NextResponse.json(
          { error: 'Instructor already has a lesson at this time.' },
          { status: 409 }
        )
      }
      if (ex.student_id === studentId) {
        return NextResponse.json(
          { error: 'Student already has a lesson at this time.' },
          { status: 409 }
        )
      }
    }
  }

  // ── Travel time check ───────────────────────────────────────
  // Runs for BOTH free-form and opening-based bookings. The regenerator only
  // avoids strict overlap, so a published opening can still be impossible to
  // reach from the previous lesson's drop-off. We block here; the student sees
  // a 409 after clicking. (Long-term cleanup: teach the regenerator to carve
  // around lessons with buffer/travel so this is rare.)
  const bufferMinutes = instructorRecord?.buffer_minutes ?? 0

  const sameInstructorToday = (existingLessons ?? [])
    .filter(ex => ex.instructor_id === instructorId)
    .map(ex => {
      const exStart = new Date(ex.scheduled_at).getTime()
      const exEnd = exStart + ex.duration_minutes * 60 * 1000
      return { ...ex, exStart, exEnd }
    })

  const prevLesson = sameInstructorToday
    .filter(ex => ex.exEnd <= lessonStart.getTime())
    .sort((a, b) => b.exEnd - a.exEnd)[0]

  const nextLesson = sameInstructorToday
    .filter(ex => ex.exStart >= lessonEnd.getTime())
    .sort((a, b) => a.exStart - b.exStart)[0]

  if (prevLesson) {
    const gapMin = Math.round((lessonStart.getTime() - prevLesson.exEnd) / 60000)
    const travelEst = estimateTravelMinutes(prevLesson.dropoff_location, pickupLocation)
    const required = Math.max(travelEst ?? 0, bufferMinutes)
    if (required > 0 && gapMin < required) {
      return NextResponse.json(
        {
          error: `Not enough time after the previous lesson. Need ~${required} min for travel/buffer, only ${gapMin} min available.`,
        },
        { status: 409 }
      )
    }
  }

  if (nextLesson) {
    const gapMin = Math.round((nextLesson.exStart - lessonEnd.getTime()) / 60000)
    const travelEst = estimateTravelMinutes(dropoffLocation, nextLesson.pickup_location)
    const required = Math.max(travelEst ?? 0, bufferMinutes)
    if (required > 0 && gapMin < required) {
      return NextResponse.json(
        {
          error: `Not enough time before the next lesson. Need ~${required} min for travel/buffer, only ${gapMin} min available.`,
        },
        { status: 409 }
      )
    }
  }

  // ── Claim the opening (CAS) ─────────────────────────────────
  // For both explicit (openingId from student) and auto-matched (admin booked
  // exactly over an existing opening) cases, atomically flip status
  // 'available' → 'booked' BEFORE creating the lesson. If another request beat
  // us to it, the update matches 0 rows and we return 409. If the lesson
  // insert later fails, we revert the opening to keep state consistent.
  const adminClient = createAdminClient()

  if (effectiveOpeningId) {
    const { data: claimed, error: claimError } = await adminClient
      .from('openings')
      .update({ status: 'booked' })
      .eq('id', effectiveOpeningId)
      .eq('status', 'available')
      .select('id')

    if (claimError) {
      return NextResponse.json({ error: claimError.message }, { status: 500 })
    }
    if (!claimed || claimed.length === 0) {
      return NextResponse.json(
        { error: 'This opening was just booked by someone else.' },
        { status: 409 }
      )
    }
  }

  const { data: lesson, error } = await adminClient
    .from('lessons')
    .insert({
      school_id: schoolId,
      student_id: studentId,
      instructor_id: instructorId,
      vehicle_id: vehicleId ?? null,
      scheduled_at: scheduledAt,
      duration_minutes: durationMinutes,
      lesson_type: lessonType,
      notes_covered: notesCovered ?? '',
      notes_practice: notesPractice ?? '',
      notes_additional: notesAdditional ?? '',
      pickup_location: pickupLocation ?? '',
      dropoff_location: dropoffLocation ?? '',
      sold_by: resolvedSoldBy,
      price_cents: priceCents,
      opening_id: effectiveOpeningId,
    })
    .select(`
      *,
      student:students(*, user:users!user_id(*)),
      instructor:instructors(*, user:users(*)),
      vehicle:vehicles(*)
    `)
    .single()

  if (error) {
    // Revert the opening claim so the slot becomes bookable again.
    if (effectiveOpeningId) {
      await adminClient
        .from('openings')
        .update({ status: 'available' })
        .eq('id', effectiveOpeningId)
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // ── Block overlapping openings ──────────────────────────────
  // Any other 'available' openings for this instructor that overlap the new
  // lesson are now unbookable — flip them to 'blocked' so they don't show up
  // on the student book screen. We exclude the one we just claimed (that's
  // already 'booked'). Idempotent: only flips status='available' rows.
  const { data: nearbyOpenings } = await adminClient
    .from('openings')
    .select('id, scheduled_at, duration_minutes')
    .eq('instructor_id', instructorId)
    .eq('status', 'available')
    .gte('scheduled_at', dayStart.toISOString())
    .lt('scheduled_at', dayEnd.toISOString())

  const overlappingIds = (nearbyOpenings ?? [])
    .filter(o => {
      const oStart = new Date(o.scheduled_at).getTime()
      const oEnd = oStart + o.duration_minutes * 60 * 1000
      return oStart < lessonEnd.getTime() && oEnd > lessonStart.getTime()
    })
    .map(o => o.id)

  if (overlappingIds.length > 0) {
    await adminClient
      .from('openings')
      .update({ status: 'blocked' })
      .in('id', overlappingIds)
      .eq('status', 'available')
  }

  // Decrement lessons_remaining for the student
  const { data: studentRecord2 } = await adminClient
    .from('students')
    .select('lessons_remaining')
    .eq('id', studentId)
    .single()

  if (studentRecord2 && studentRecord2.lessons_remaining > 0) {
    await adminClient
      .from('students')
      .update({ lessons_remaining: studentRecord2.lessons_remaining - 1 })
      .eq('id', studentId)
  }

  return NextResponse.json({ lesson }, { status: 201 })
}
