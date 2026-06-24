// /api/instructors/[id]/deductions — admin CRUD for instructor deductions
// (car insurance, personal insurance, other company expenses).
//   GET  → list deductions for the instructor
//   POST → create a new deduction

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(['car_insurance', 'personal_insurance', 'other']),
  amountCents: z.number().int().min(0),
  detail: z.string().max(500).optional().default(''),
})

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
    .select('id, school_id')
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
    .from('instructor_deductions')
    .select('*')
    .eq('instructor_id', id)
    .order('date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deductions: data ?? [] })
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

  const { error } = await auth.supabase.from('instructor_deductions').insert({
    school_id: auth.instructor.school_id,
    instructor_id: id,
    date: parsed.data.date,
    type: parsed.data.type,
    amount_cents: parsed.data.amountCents,
    detail: parsed.data.detail,
    created_by: auth.user.id,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
