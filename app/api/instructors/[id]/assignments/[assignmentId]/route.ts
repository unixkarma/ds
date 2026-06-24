// /api/instructors/[id]/assignments/[assignmentId]
//   PATCH  → edit fields and/or change status (completing pays the instructor)
//   DELETE → remove the assignment

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const updateSchema = z.object({
  scheduledAt: z.string().datetime().optional(),
  durationMinutes: z.number().int().min(1).max(1440).optional(),
  detail: z.string().max(500).optional(),
  status: z.enum(['scheduled', 'completed', 'cancelled']).optional(),
})

async function authorizeAdmin(instructorId: string, assignmentId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }

  const { data: profile } = await supabase
    .from('users')
    .select('role, school_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return { error: 'Forbidden', status: 403 as const }
  }

  const { data: instructor } = await supabase
    .from('instructors')
    .select('id, school_id, hourly_rate_cents')
    .eq('id', instructorId)
    .eq('school_id', profile.school_id)
    .single()

  if (!instructor) return { error: 'Instructor not found', status: 404 as const }

  const { data: assignment } = await supabase
    .from('instructor_assignments')
    .select('id, status, duration_minutes')
    .eq('id', assignmentId)
    .eq('instructor_id', instructorId)
    .single()

  if (!assignment) return { error: 'Assignment not found', status: 404 as const }

  return { supabase, instructor, assignment }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  const { id, assignmentId } = await params
  const auth = await authorizeAdmin(id, assignmentId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const updates: Record<string, unknown> = {}
  if (parsed.data.scheduledAt !== undefined) updates.scheduled_at = parsed.data.scheduledAt
  if (parsed.data.durationMinutes !== undefined) updates.duration_minutes = parsed.data.durationMinutes
  if (parsed.data.detail !== undefined) updates.detail = parsed.data.detail

  if (parsed.data.status !== undefined) {
    updates.status = parsed.data.status
    // Pay the instructor (hourly) when the assignment is completed; otherwise zero.
    const durationMinutes = parsed.data.durationMinutes ?? auth.assignment.duration_minutes
    updates.earning_cents =
      parsed.data.status === 'completed'
        ? Math.round(auth.instructor.hourly_rate_cents * (durationMinutes / 60))
        : 0
  }

  const { error } = await auth.supabase
    .from('instructor_assignments')
    .update(updates)
    .eq('id', assignmentId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  const { id, assignmentId } = await params
  const auth = await authorizeAdmin(id, assignmentId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { error } = await auth.supabase
    .from('instructor_assignments')
    .delete()
    .eq('id', assignmentId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
