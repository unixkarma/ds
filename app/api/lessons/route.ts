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
const createLessonSchema = z.object({
  studentId: z.string().uuid(),
  instructorId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(240).default(60),
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

  const { studentId, instructorId, scheduledAt, durationMinutes, vehicleId, notesCovered, notesPractice, notesAdditional, pickupLocation, dropoffLocation, soldBy } = parsed.data
  const schoolId = profile.school_id

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

  // Fetch instructor for pricing + buffer
  const { data: instructorRecord } = await supabase
    .from('instructors')
    .select('modality, hourly_rate_cents, lesson_price_cents, commission_rate, buffer_minutes')
    .eq('id', instructorId)
    .single()

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

  // ── Conflict detection ──────────────────────────────────────
  // Fetch all lessons for this instructor and student on the same day
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

  // ── Travel time check (ZIP-prefix heuristic) ────────────────
  // Find the closest prev/next lesson for THIS instructor on the same day.
  // Required gap = max(zip-heuristic, instructor.buffer_minutes).
  // If a ZIP can't be extracted, fall back to buffer_minutes alone.
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

  // ── Create the lesson ────────────────────────────────────────
  const adminClient = createAdminClient()

  const { data: lesson, error } = await adminClient
    .from('lessons')
    .insert({
      school_id: schoolId,
      student_id: studentId,
      instructor_id: instructorId,
      vehicle_id: vehicleId ?? null,
      scheduled_at: scheduledAt,
      duration_minutes: durationMinutes,
      notes_covered: notesCovered ?? '',
      notes_practice: notesPractice ?? '',
      notes_additional: notesAdditional ?? '',
      pickup_location: pickupLocation ?? '',
      dropoff_location: dropoffLocation ?? '',
      sold_by: resolvedSoldBy,
      price_cents: priceCents,
    })
    .select(`
      *,
      student:students(*, user:users!user_id(*)),
      instructor:instructors(*, user:users(*)),
      vehicle:vehicles(*)
    `)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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
