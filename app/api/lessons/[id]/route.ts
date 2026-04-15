// PATCH /api/lessons/[id] — cancel or reschedule a lesson

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const updateLessonSchema = z.object({
  status: z.enum(['cancelled', 'completed', 'no_show']).optional(),
  scheduledAt: z.string().datetime().optional(),
  durationMinutes: z.number().int().min(15).max(240).optional(),
  vehicleId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
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
    .select('id, status, instructor_id, student_id, duration_minutes, school_id, sold_by, price_cents')
    .eq('id', id)
    .eq('school_id', profile.school_id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })

  const updates = parsed.data

  // If rescheduling, run conflict detection for the new time
  if (updates.scheduledAt) {
    const newStart = new Date(updates.scheduledAt)
    const newDuration = updates.durationMinutes ?? existing.duration_minutes
    const newEnd = new Date(newStart.getTime() + newDuration * 60 * 1000)

    const dayStart = new Date(newStart)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayEnd.getDate() + 1)

    const { data: conflicts } = await supabase
      .from('lessons')
      .select('id, scheduled_at, duration_minutes, instructor_id, student_id')
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
        if (ex.instructor_id === existing.instructor_id) {
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
  }

  const adminClient = createAdminClient()

  const lessonUpdates: Record<string, unknown> = {}
  if (updates.status !== undefined) lessonUpdates.status = updates.status
  if (updates.scheduledAt !== undefined) lessonUpdates.scheduled_at = updates.scheduledAt
  if (updates.durationMinutes !== undefined) lessonUpdates.duration_minutes = updates.durationMinutes
  if (updates.vehicleId !== undefined) lessonUpdates.vehicle_id = updates.vehicleId
  if (updates.notes !== undefined) lessonUpdates.notes = updates.notes
  if (updates.pickupLocation !== undefined) lessonUpdates.pickup_location = updates.pickupLocation
  if (updates.dropoffLocation !== undefined) lessonUpdates.dropoff_location = updates.dropoffLocation

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

  // ── Track cancellation fees ─────────────────────────────────
  if (updates.status === 'cancelled' && existing.status !== 'cancelled') {
    // Determine who cancelled based on user role
    let cancelledBy: string
    if (profile.role === 'instructor') {
      cancelledBy = 'instructor'
    } else if (profile.role === 'student') {
      cancelledBy = 'student'
    } else {
      cancelledBy = 'admin'
    }
    lessonUpdates.cancelled_by = cancelledBy

    // Fetch school cancellation fee settings
    if (cancelledBy !== 'admin') {
      const { data: school } = await adminClient
        .from('schools')
        .select('student_cancellation_fee_cents, instructor_cancellation_fee_cents')
        .eq('id', existing.school_id)
        .single()

      if (school) {
        lessonUpdates.cancellation_fee_cents = cancelledBy === 'student'
          ? school.student_cancellation_fee_cents
          : school.instructor_cancellation_fee_cents
      }
    }
  }

  const { error } = await adminClient
    .from('lessons')
    .update(lessonUpdates)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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
  }

  return NextResponse.json({ success: true })
}
