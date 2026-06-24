// /api/instructors/[id]/reimbursements/[rid] — admin review.
//   PATCH → approve / reject / mark paid

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const updateSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'paid']),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; rid: string }> }
) {
  const { id, rid } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('role, school_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  // Scoped by school via RLS admin policy; instructor_id pins it to this instructor.
  const { data: existing } = await supabase
    .from('instructor_reimbursements')
    .select('id')
    .eq('id', rid)
    .eq('instructor_id', id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Reimbursement not found' }, { status: 404 })

  const { error } = await supabase
    .from('instructor_reimbursements')
    .update({
      status: parsed.data.status,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', rid)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
