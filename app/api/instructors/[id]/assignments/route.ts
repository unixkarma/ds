// /api/instructors/[id]/assignments — admin CRUD for instructor assignments.
//   GET  → list assignments for the instructor
//   POST → create a new assignment

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const createSchema = z.object({
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().min(1).max(1440),
  detail: z.string().max(500).optional().default(''),
})

// Verify the caller is an admin and the instructor belongs to their school.
async function authorizeAdmin(instructorId: string) {
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

  return { supabase, user, instructor }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await authorizeAdmin(id)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data, error } = await auth.supabase
    .from('instructor_assignments')
    .select('*')
    .eq('instructor_id', id)
    .order('scheduled_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ assignments: data ?? [] })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await authorizeAdmin(id)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await request.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { error } = await auth.supabase.from('instructor_assignments').insert({
    school_id: auth.instructor.school_id,
    instructor_id: id,
    scheduled_at: parsed.data.scheduledAt,
    duration_minutes: parsed.data.durationMinutes,
    detail: parsed.data.detail,
    created_by: auth.user.id,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
