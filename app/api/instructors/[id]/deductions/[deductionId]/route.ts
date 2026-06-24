// /api/instructors/[id]/deductions/[deductionId]
//   PATCH  → edit a deduction
//   DELETE → remove a deduction

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const updateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  type: z.enum(['car_insurance', 'personal_insurance', 'other']).optional(),
  amountCents: z.number().int().min(0).optional(),
  detail: z.string().max(500).optional(),
})

async function authorizeAdmin(instructorId: string, deductionId: string) {
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

  const { data: deduction } = await supabase
    .from('instructor_deductions')
    .select('id')
    .eq('id', deductionId)
    .eq('instructor_id', instructorId)
    .single()

  if (!deduction) return { error: 'Deduction not found', status: 404 as const }

  return { supabase }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; deductionId: string }> }
) {
  const { id, deductionId } = await params
  const auth = await authorizeAdmin(id, deductionId)
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
  if (parsed.data.date !== undefined) updates.date = parsed.data.date
  if (parsed.data.type !== undefined) updates.type = parsed.data.type
  if (parsed.data.amountCents !== undefined) updates.amount_cents = parsed.data.amountCents
  if (parsed.data.detail !== undefined) updates.detail = parsed.data.detail

  const { error } = await auth.supabase
    .from('instructor_deductions')
    .update(updates)
    .eq('id', deductionId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; deductionId: string }> }
) {
  const { id, deductionId } = await params
  const auth = await authorizeAdmin(id, deductionId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { error } = await auth.supabase
    .from('instructor_deductions')
    .delete()
    .eq('id', deductionId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
