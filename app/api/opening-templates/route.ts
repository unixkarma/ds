// GET  /api/opening-templates — list templates (school defaults + own)
// POST /api/opening-templates — create a new template
//   - Instructor: must include their own instructor_id (or null for own template — coerced)
//   - Admin:      can pass instructor_id null (school-level) or any instructor_id in their school

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const slotSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/, 'Format must be HH:MM'),
  duration_min: z.number().int().min(15).max(240),
})

const createSchema = z.object({
  name: z.string().min(1).max(60),
  slots: z.array(slotSchema).min(1, 'At least one slot is required'),
  // For admin only — null = school-level, uuid = specific instructor
  instructor_id: z.string().uuid().nullable().optional(),
})

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('role, school_id')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // RLS already filters to school + (admin sees all, instructor sees school-level + own).
  // For instructors, narrow to school-level + own to avoid pulling other instructors' customs.
  let query = supabase
    .from('opening_templates')
    .select('*')
    .eq('school_id', profile.school_id)
    .order('created_at', { ascending: true })

  if (profile.role === 'instructor') {
    const { data: instructor } = await supabase
      .from('instructors')
      .select('id')
      .eq('user_id', user.id)
      .single()
    if (!instructor) return NextResponse.json({ templates: [] })
    query = query.or(`instructor_id.is.null,instructor_id.eq.${instructor.id}`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ templates: data })
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
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  // Determine final instructor_id based on role
  let instructorId: string | null = null
  if (profile.role === 'instructor') {
    // Instructor always creates their own — ignore any instructor_id in body
    const { data: instructor } = await supabase
      .from('instructors')
      .select('id')
      .eq('user_id', user.id)
      .single()
    if (!instructor) return NextResponse.json({ error: 'Instructor record not found' }, { status: 404 })
    instructorId = instructor.id
  } else {
    // Admin: use whatever was passed (null for school-level, or a specific instructor)
    instructorId = parsed.data.instructor_id ?? null
  }

  const adminClient = createAdminClient()
  const { data: tpl, error } = await adminClient
    .from('opening_templates')
    .insert({
      school_id: profile.school_id,
      instructor_id: instructorId,
      name: parsed.data.name,
      slots: parsed.data.slots,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'A template with this name already exists.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ template: tpl }, { status: 201 })
}
