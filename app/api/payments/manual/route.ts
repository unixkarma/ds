// POST /api/payments/manual — Admin records a non-Stripe payment (cash/check/other)
// and credits the student's lesson balance via the shared payments service.

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { creditLessonsForPayment } from '@/lib/services/payments'

const manualPaymentSchema = z
  .object({
    studentId: z.string().uuid(),
    packageId: z.string().uuid().optional(),
    lessonCount: z.number().int().min(1).optional(),
    amountCents: z.number().int().min(0).optional(),
    paymentMethod: z.enum(['cash', 'check', 'other']),
  })
  .refine(
    (v) =>
      !!v.packageId ||
      (v.lessonCount !== undefined && v.amountCents !== undefined),
    { message: 'Provide either packageId or both lessonCount and amountCents.' }
  )

export async function POST(request: NextRequest) {
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
  const parsed = manualPaymentSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { studentId, packageId, paymentMethod } = parsed.data
  const adminClient = createAdminClient()

  // Verify the student belongs to this school
  const { data: student } = await adminClient
    .from('students')
    .select('id, school_id')
    .eq('id', studentId)
    .eq('school_id', profile.school_id)
    .single()

  if (!student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 })
  }

  // Resolve lesson count + amount from the package (if provided)
  let lessonCount = parsed.data.lessonCount
  let amountCents = parsed.data.amountCents

  if (packageId) {
    const { data: pkg } = await adminClient
      .from('packages')
      .select('id, school_id, lesson_count, price_cents')
      .eq('id', packageId)
      .eq('school_id', profile.school_id)
      .single()

    if (!pkg) {
      return NextResponse.json({ error: 'Package not found' }, { status: 404 })
    }

    lessonCount = pkg.lesson_count
    amountCents = pkg.price_cents
  }

  if (lessonCount === undefined || amountCents === undefined) {
    return NextResponse.json({ error: 'Could not determine lesson count or amount' }, { status: 400 })
  }

  try {
    const { paymentId } = await creditLessonsForPayment({
      adminClient,
      schoolId: profile.school_id,
      studentId,
      packageId: packageId ?? null,
      lessonCount,
      amountCents,
      paymentMethod,
    })

    return NextResponse.json({ paymentId }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to record payment'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
