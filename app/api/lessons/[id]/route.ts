// PATCH /api/lessons/[id] — cancel or reschedule a lesson

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { estimateTravelMinutes } from '@/lib/travel-time'
import { insertLedgerEntry } from '@/lib/services/student-ledger'

// A cancellation/reschedule within this window of the lesson start charges a fee.
const CANCELLATION_WINDOW_HOURS = 24

const updateLessonSchema = z.object({
  status: z.enum(['cancelled', 'completed', 'no_show']).optional(),
  // Who initiated a cancellation. Optional override so an admin can attribute a
  // cancellation to the student (and trigger the late-cancellation charge).
  // Falls back to the caller's role when omitted.
  cancelledBy: z.enum(['student', 'instructor', 'admin']).optional(),
  scheduledAt: z.string().datetime().optional(),
  durationMinutes: z.number().int().min(15).max(240).optional(),
  vehicleId: z.string().uuid().nullable().optional(),
  notesCovered: z.string().max(150).optional(),
  notesPractice: z.string().max(150).optional(),
  notesAdditional: z.string().max(150).optional(),
  pickupLocation: z.string().optional(),
  dropoffLocation: z.string().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

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
  const parsed = updateLessonSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  // Verify the lesson belongs to this school
  const { data: existing } = await supabase
    .from('lessons')
    .select('id, status, instructor_id, student_id, scheduled_at, duration_minutes, school_id, sold_by, price_cents, pickup_location, dropoff_location, opening_id, lesson_type')
    .eq('id', id)
    .eq('school_id', profile.school_id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })

  const updates = parsed.data

  // Status state machine: terminal states (completed/cancelled/no_show) may only
  // be entered from `scheduled`. Re-transitioning between terminal states (e.g.
  // no_show → completed) would re-run earnings/counter side-effects without
  // reversing the credit refund already applied — effectively a free lesson.
  if (
    updates.status !== undefined &&
    updates.status !== existing.status &&
    existing.status !== 'scheduled'
  ) {
    return NextResponse.json(
      {
        error: `Cannot change a ${existing.status} lesson to ${updates.status}. Only scheduled lessons can be completed, cancelled or marked no-show.`,
      },
      { status: 409 }
    )
  }

  // Re-validate conflicts/travel whenever the lesson's footprint changes —
  // either its start time (reschedule) or its duration (a longer lesson can
  // eat into the next lesson's buffer/travel gap).
  //
  // When a rescheduled observation finds a new covering drive, we re-point its
  // paired_lesson_id; captured here in the outer scope so it survives into the
  // lessonUpdates payload built below.
  let lessonUpdatesPairedLessonId: string | null = null
  if (updates.scheduledAt || updates.durationMinutes) {
    const newStart = new Date(updates.scheduledAt ?? existing.scheduled_at)
    const newDuration = updates.durationMinutes ?? existing.duration_minutes
    const newEnd = new Date(newStart.getTime() + newDuration * 60 * 1000)
    const newPickup = updates.pickupLocation ?? existing.pickup_location
    const newDropoff = updates.dropoffLocation ?? existing.dropoff_location

    // Enforce the school's max-booking-days-ahead window on the NEW start time,
    // but only when the start time is actually changing (a duration-only edit
    // doesn't move the date).
    if (updates.scheduledAt) {
      const { data: school } = await supabase
        .from('schools')
        .select('max_booking_days_ahead')
        .eq('id', profile.school_id)
        .single()
      if (school) {
        const maxDate = new Date()
        maxDate.setDate(maxDate.getDate() + school.max_booking_days_ahead)
        if (newStart > maxDate) {
          return NextResponse.json(
            { error: `Cannot reschedule more than ${school.max_booking_days_ahead} days in advance.` },
            { status: 400 }
          )
        }
      }
    }

    const dayStart = new Date(newStart)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayEnd.getDate() + 1)

    const { data: conflicts } = await supabase
      .from('lessons')
      .select('id, scheduled_at, duration_minutes, instructor_id, student_id, lesson_type, pickup_location, dropoff_location')
      .eq('school_id', profile.school_id)
      .eq('status', 'scheduled')
      .neq('id', id) // exclude the current lesson
      .gte('scheduled_at', dayStart.toISOString())
      .lt('scheduled_at', dayEnd.toISOString())

    for (const ex of conflicts ?? []) {
      const exStart = new Date(ex.scheduled_at)
      const exEnd = new Date(exStart.getTime() + ex.duration_minutes * 60 * 1000)
      const overlaps = exStart < newEnd && exEnd > newStart

      if (overlaps) {
        // Same-type check mirrors the DB exclusion constraint: a drive and an
        // observation may share the instructor's slot (ride-along).
        if (ex.instructor_id === existing.instructor_id && ex.lesson_type === existing.lesson_type) {
          return NextResponse.json(
            { error: 'Instructor already has a lesson at this time.' },
            { status: 409 }
          )
        }
        if (ex.student_id === existing.student_id) {
          return NextResponse.json(
            { error: 'Student already has a lesson at this time.' },
            { status: 409 }
          )
        }
      }
    }

    // A rescheduled observation must still ride inside a scheduled drive
    // lesson of the same instructor (same pairing rule as creation).
    if (existing.lesson_type === 'observation') {
      const coveringDrive = (conflicts ?? []).find(ex => {
        if (ex.instructor_id !== existing.instructor_id || ex.lesson_type !== 'drive') return false
        const exStart = new Date(ex.scheduled_at)
        const exEnd = new Date(exStart.getTime() + ex.duration_minutes * 60 * 1000)
        return exStart <= newStart && exEnd >= newEnd
      })
      if (!coveringDrive) {
        return NextResponse.json(
          {
            error:
              'Observation must take place during an existing drive lesson with this instructor.',
          },
          { status: 409 }
        )
      }
      lessonUpdatesPairedLessonId = coveringDrive.id
    }

    // Travel time check (ZIP-prefix heuristic) for back-to-back lessons.
    // Observation lessons ride in the drive lesson's car — no travel of their own.
    const { data: instructorRecord } = await supabase
      .from('instructors')
      .select('buffer_minutes')
      .eq('id', existing.instructor_id)
      .single()
    const bufferMinutes = existing.lesson_type === 'drive' ? (instructorRecord?.buffer_minutes ?? 0) : 0

    const sameInstructorToday = (existing.lesson_type === 'drive' ? conflicts ?? [] : [])
      .filter(ex => ex.instructor_id === existing.instructor_id)
      .map(ex => {
        const exStart = new Date(ex.scheduled_at).getTime()
        const exEnd = exStart + ex.duration_minutes * 60 * 1000
        return { ...ex, exStart, exEnd }
      })

    const prevLesson = sameInstructorToday
      .filter(ex => ex.exEnd <= newStart.getTime())
      .sort((a, b) => b.exEnd - a.exEnd)[0]

    const nextLesson = sameInstructorToday
      .filter(ex => ex.exStart >= newEnd.getTime())
      .sort((a, b) => a.exStart - b.exStart)[0]

    if (prevLesson) {
      const gapMin = Math.round((newStart.getTime() - prevLesson.exEnd) / 60000)
      const travelEst = estimateTravelMinutes(prevLesson.dropoff_location, newPickup)
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
      const gapMin = Math.round((nextLesson.exStart - newEnd.getTime()) / 60000)
      const travelEst = estimateTravelMinutes(newDropoff, nextLesson.pickup_location)
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
  }

  const adminClient = createAdminClient()

  const lessonUpdates: Record<string, unknown> = {}
  if (updates.status !== undefined) lessonUpdates.status = updates.status

  // Stamp the transition time when the status changes to a terminal state.
  if (updates.status !== undefined && updates.status !== existing.status) {
    const nowIso = new Date().toISOString()
    if (updates.status === 'completed') lessonUpdates.completed_at = nowIso
    if (updates.status === 'cancelled') lessonUpdates.cancelled_at = nowIso
    if (updates.status === 'no_show') lessonUpdates.no_show_at = nowIso
  }
  if (updates.scheduledAt !== undefined) lessonUpdates.scheduled_at = updates.scheduledAt
  if (updates.durationMinutes !== undefined) lessonUpdates.duration_minutes = updates.durationMinutes
  if (updates.vehicleId !== undefined) lessonUpdates.vehicle_id = updates.vehicleId
  if (updates.notesCovered !== undefined) lessonUpdates.notes_covered = updates.notesCovered
  if (updates.notesPractice !== undefined) lessonUpdates.notes_practice = updates.notesPractice
  if (updates.notesAdditional !== undefined) lessonUpdates.notes_additional = updates.notesAdditional
  if (updates.pickupLocation !== undefined) lessonUpdates.pickup_location = updates.pickupLocation
  if (updates.dropoffLocation !== undefined) lessonUpdates.dropoff_location = updates.dropoffLocation
  // Persist the re-paired covering drive for a rescheduled observation.
  if (lessonUpdatesPairedLessonId !== null) lessonUpdates.paired_lesson_id = lessonUpdatesPairedLessonId

  // ── Calculate instructor earnings when marking complete ─────
  if (updates.status === 'completed' && existing.status !== 'completed') {
    const { data: instructor } = await adminClient
      .from('instructors')
      .select('modality, hourly_rate_cents, commission_rate')
      .eq('id', existing.instructor_id)
      .single()

    if (instructor) {
      const hours = existing.duration_minutes / 60
      let earningCents = 0

      if (instructor.modality === 'independent') {
        // Independent: lesson price minus commission
        earningCents = Math.round(existing.price_cents - (existing.price_cents * Number(instructor.commission_rate)))
      } else {
        // School: hourly rate × hours
        earningCents = Math.round(instructor.hourly_rate_cents * hours)
      }

      lessonUpdates.instructor_earning_cents = earningCents
    }
  }

  // Hours remaining until the lesson starts (used for the 24h fee window).
  const hoursUntilLesson =
    (new Date(existing.scheduled_at).getTime() - Date.now()) / (1000 * 60 * 60)
  const withinFeeWindow = hoursUntilLesson < CANCELLATION_WINDOW_HOURS

  // Deferred student ledger charge — inserted after the lesson update succeeds.
  let studentCharge: { cents: number; description: string } | null = null

  // ── Track cancellation fees ─────────────────────────────────
  if (updates.status === 'cancelled' && existing.status !== 'cancelled') {
    // Who cancelled: explicit override (admin can attribute to student) or role.
    let cancelledBy: string
    if (updates.cancelledBy) {
      cancelledBy = updates.cancelledBy
    } else if (profile.role === 'instructor') {
      cancelledBy = 'instructor'
    } else if (profile.role === 'student') {
      cancelledBy = 'student'
    } else {
      cancelledBy = 'admin'
    }
    lessonUpdates.cancelled_by = cancelledBy

    // A fee only applies when cancelling within the 24h window. Cancelling
    // 48h+ ahead is free; 12h ahead is charged.
    if (cancelledBy !== 'admin' && withinFeeWindow) {
      const { data: school } = await adminClient
        .from('schools')
        .select('student_cancellation_fee_cents, instructor_cancellation_fee_cents')
        .eq('id', existing.school_id)
        .single()

      if (school) {
        const fee = cancelledBy === 'student'
          ? school.student_cancellation_fee_cents
          : school.instructor_cancellation_fee_cents
        lessonUpdates.cancellation_fee_cents = fee

        // The student fee is billed to the student's account. The instructor
        // fee is handled as a payroll deduction (no student charge).
        if (cancelledBy === 'student' && fee > 0) {
          studentCharge = { cents: fee, description: 'Late cancellation fee (<24h)' }
        }
      }
    }
  }

  // ── No-show fee ─────────────────────────────────────────────
  // Marking a no-show charges a configurable fee to the student. The lesson
  // credit is refunded below (the student keeps the lesson, only loses the fee).
  if (updates.status === 'no_show' && existing.status !== 'no_show') {
    const { data: school } = await adminClient
      .from('schools')
      .select('student_no_show_fee_cents')
      .eq('id', existing.school_id)
      .single()

    const fee = school?.student_no_show_fee_cents ?? 0
    if (fee > 0) {
      lessonUpdates.no_show_fee_cents = fee
      studentCharge = { cents: fee, description: 'No-show fee' }
    }
  }

  // ── Late reschedule fee ─────────────────────────────────────
  // Rescheduling a scheduled lesson within the 24h window, when attributed to
  // the student, is treated like a late cancellation and charges the fee.
  if (
    updates.scheduledAt &&
    !updates.status &&
    existing.status === 'scheduled' &&
    updates.cancelledBy === 'student' &&
    withinFeeWindow
  ) {
    const { data: school } = await adminClient
      .from('schools')
      .select('student_cancellation_fee_cents')
      .eq('id', existing.school_id)
      .single()

    const fee = school?.student_cancellation_fee_cents ?? 0
    if (fee > 0) {
      studentCharge = { cents: fee, description: 'Late reschedule fee (<24h)' }
    }
  }

  const { error } = await adminClient
    .from('lessons')
    .update(lessonUpdates)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Bill the student for a late cancellation / reschedule / no-show fee.
  if (studentCharge) {
    await insertLedgerEntry({
      client: adminClient,
      schoolId: existing.school_id,
      studentId: existing.student_id,
      amountCents: studentCharge.cents,
      entryType: 'charge',
      description: studentCharge.description,
      createdBy: user.id,
    })
  }

  // No-show refunds the lesson credit (student keeps the lesson, only pays the fee).
  if (updates.status === 'no_show' && existing.status === 'scheduled') {
    const { data: student } = await adminClient
      .from('students')
      .select('lessons_remaining')
      .eq('id', existing.student_id)
      .single()

    if (student) {
      await adminClient
        .from('students')
        .update({ lessons_remaining: student.lessons_remaining + 1 })
        .eq('id', existing.student_id)
    }
  }

  // When marking a lesson as completed, increment the student's completed lesson count
  if (updates.status === 'completed' && existing.status !== 'completed') {
    const { data: student } = await adminClient
      .from('students')
      .select('total_lessons_completed')
      .eq('id', existing.student_id)
      .single()

    if (student) {
      await adminClient
        .from('students')
        .update({ total_lessons_completed: student.total_lessons_completed + 1 })
        .eq('id', existing.student_id)
    }
  }

  // When cancelling a scheduled lesson, refund the lesson credit back to the student
  // and release any opening it was attached to so other students can grab it.
  if (updates.status === 'cancelled' && existing.status === 'scheduled') {
    const { data: student } = await adminClient
      .from('students')
      .select('lessons_remaining')
      .eq('id', existing.student_id)
      .single()

    if (student) {
      await adminClient
        .from('students')
        .update({ lessons_remaining: student.lessons_remaining + 1 })
        .eq('id', existing.student_id)
    }

    if (existing.opening_id) {
      await adminClient
        .from('openings')
        .update({ status: 'available' })
        .eq('id', existing.opening_id)
        .eq('status', 'booked')
    }

    // Auto-unblock any openings that were blocked because they overlapped THIS
    // lesson's time slot. Now that the lesson is cancelled, they're free again.
    // (Edge case: if an admin/instructor had manually `blocked` an opening for
    // an unrelated reason that happens to overlap the cancelled lesson, this
    // would unintentionally unblock it. There's no UI for manual blocks today,
    // so this is acceptable — revisit if/when that flow is added.)
    const lessonStart = new Date(existing.scheduled_at)
    const lessonEnd = new Date(lessonStart.getTime() + existing.duration_minutes * 60 * 1000)
    const dayStart = new Date(lessonStart)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayEnd.getDate() + 1)

    const { data: blockedNearby } = await adminClient
      .from('openings')
      .select('id, scheduled_at, duration_minutes')
      .eq('instructor_id', existing.instructor_id)
      .eq('status', 'blocked')
      .gte('scheduled_at', dayStart.toISOString())
      .lt('scheduled_at', dayEnd.toISOString())

    const toUnblock = (blockedNearby ?? [])
      .filter(o => {
        const oStart = new Date(o.scheduled_at).getTime()
        const oEnd = oStart + o.duration_minutes * 60 * 1000
        return oStart < lessonEnd.getTime() && oEnd > lessonStart.getTime()
      })
      .map(o => o.id)

    if (toUnblock.length > 0) {
      await adminClient
        .from('openings')
        .update({ status: 'available' })
        .in('id', toUnblock)
        .eq('status', 'blocked')
    }
  }

  return NextResponse.json({ success: true })
}
