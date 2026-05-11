// POST /api/students/[id]/ledger — Admin manually adjusts a student's balance.
// Inserts a ledger entry with NO money movement (no payment row). Use cases:
//   - charge: add a fee (e.g. late cancellation, extra material)
//   - credit: subtract from the balance (e.g. discount, courtesy adjustment)
// For payments received use POST /api/payments/manual instead.

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { insertLedgerEntry } from '@/lib/services/student-ledger'

const bodySchema = z.object({
  type: z.enum(['charge', 'credit']),
  amountCents: z.number().int().min(1),
  description: z.string().min(1).max(200),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: studentId } = await params

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

  const parsed = bodySchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const adminClient = createAdminClient()

  const { data: student } = await adminClient
    .from('students')
    .select('id, school_id')
    .eq('id', studentId)
    .eq('school_id', profile.school_id)
    .single()

  if (!student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 })
  }

  // Charge = add to balance (positive). Credit = subtract (negative).
  const signedAmount =
    parsed.data.type === 'charge' ? parsed.data.amountCents : -parsed.data.amountCents

  try {
    const { id } = await insertLedgerEntry({
      client: adminClient,
      schoolId: profile.school_id,
      studentId,
      amountCents: signedAmount,
      entryType: 'adjustment',
      description: parsed.data.description.trim(),
      createdBy: user.id,
    })
    return NextResponse.json({ id }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to adjust balance'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
