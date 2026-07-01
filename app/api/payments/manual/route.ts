// POST /api/payments/manual — Admin records a payment OR assigns a package
// in one of three modes:
//   - package: assign a package, with payment_status = paid_full | partial | unpaid.
//              Creates a `student_purchases` row. Lessons activate proportionally
//              to the amount paid: floor(paid * total / price). Records a payment
//              for the paid portion (if any). Inserts a ledger charge for the
//              unpaid portion (if any).
//   - custom:  credit N lessons in exchange for an arbitrary amount paid (always
//              paid in full). Records a payment with the description as concept.
//              No purchase row, no ledger entry.
//   - balance: pay down the student's outstanding balance. Applies to outstanding
//              purchases (oldest first), unlocking lessons proportionally. Records
//              a payment + ledger payment entry.

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { serverError } from '@/lib/api-error'
import { notifyPackagePurchase } from '@/lib/email/send-package-confirmation'

const bodySchema = z
  .object({
    studentId: z.string().uuid(),
    mode: z.enum(['package', 'custom', 'balance']),
    packageId: z.string().uuid().optional(),
    paymentStatus: z.enum(['paid_full', 'partial', 'unpaid']).optional(),
    lessonCount: z.number().int().min(1).optional(),
    amountPaidCents: z.number().int().min(0).optional(),
    discountCents: z.number().int().min(0).optional(),
    paymentMethod: z.enum(['cash', 'check', 'other']),
    description: z.string().max(200).nullable().optional(),
    soldBy: z.enum(['operator', 'instructor']).optional(),
    soldByInstructorId: z.string().uuid().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.soldBy === 'instructor' && !v.soldByInstructorId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['soldByInstructorId'], message: 'Select the instructor who sold this' })
    }
    if (v.mode === 'package') {
      if (!v.packageId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['packageId'], message: 'packageId required' })
      if (!v.paymentStatus) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['paymentStatus'], message: 'paymentStatus required' })
      if (v.paymentStatus === 'partial' && (v.amountPaidCents === undefined || v.amountPaidCents <= 0)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amountPaidCents'], message: 'amountPaidCents required for partial' })
      }
    }
    if (v.mode !== 'package' && v.discountCents !== undefined && v.discountCents > 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['discountCents'], message: 'Discount is only allowed in package mode' })
    }
    if (v.mode === 'custom') {
      if (v.lessonCount === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['lessonCount'], message: 'lessonCount required' })
      if (v.amountPaidCents === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amountPaidCents'], message: 'amountPaidCents required' })
    }
    if (v.mode === 'balance') {
      if (v.amountPaidCents === undefined || v.amountPaidCents <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amountPaidCents'], message: 'amountPaidCents required' })
      }
    }
  })

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
  const parsed = bodySchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const {
    studentId,
    mode,
    packageId,
    paymentStatus,
    paymentMethod,
    description,
  } = parsed.data

  const adminClient = createAdminClient()

  // Sale attribution: defaults to the operator (the admin recording it).
  const soldBy: 'operator' | 'instructor' = parsed.data.soldBy ?? 'operator'
  const soldByInstructorId = soldBy === 'instructor' ? parsed.data.soldByInstructorId! : null

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

  // Validate the credited instructor belongs to this school
  if (soldByInstructorId) {
    const { data: inst } = await adminClient
      .from('instructors')
      .select('id')
      .eq('id', soldByInstructorId)
      .eq('school_id', profile.school_id)
      .single()
    if (!inst) {
      return NextResponse.json({ error: 'Instructor not found' }, { status: 404 })
    }
  }

  try {
    // ── Mode: package ─────────────────────────────────────
    if (mode === 'package') {
      const { data: pkg } = await adminClient
        .from('packages')
        .select('id, school_id, name, lesson_count, price_cents, classroom_required, requirements')
        .eq('id', packageId!)
        .eq('school_id', profile.school_id)
        .single()

      if (!pkg) {
        return NextResponse.json({ error: 'Package not found' }, { status: 404 })
      }

      const price = pkg.price_cents
      const discount = Math.min(parsed.data.discountCents ?? 0, price)
      const effectivePrice = price - discount
      const paid =
        paymentStatus === 'paid_full' ? effectivePrice
        : paymentStatus === 'partial' ? Math.min(parsed.data.amountPaidCents!, effectivePrice)
        : 0

      // Atomic: purchase + payment (if any) + lesson bump + unpaid-portion
      // ledger charge, all in one transaction. Lessons activate proportionally.
      const { data: result, error: rpcError } = await adminClient.rpc(
        'record_package_purchase',
        {
          p_school_id: profile.school_id,
          p_student_id: studentId,
          p_package_id: pkg.id,
          p_package_name: pkg.name,
          p_total_lessons: pkg.lesson_count,
          p_price_cents: price,
          p_discount_cents: discount,
          p_purchase_paid_cents: paid,
          p_payment_amount_cents: paid,
          p_classroom_required: pkg.classroom_required ?? 0,
          p_requirements: pkg.requirements ?? null,
          p_payment_method: paymentMethod,
          p_card_brand: null,
          p_card_last4: null,
          p_stripe_payment_intent_id: null,
          p_receipt_url: null,
          p_description: description ?? null,
          p_sold_by: soldBy,
          p_recorded_by: user.id,
          p_sold_by_instructor_id: soldByInstructorId,
        }
      )

      if (rpcError || !result) {
        return serverError('payments/manual: record_package_purchase', rpcError)
      }

      const lessonsActivated: number = result.lessons_activated ?? 0
      const owed: number = result.owed ?? 0

      // Fire-and-forget confirmation email (never blocks the response)
      void notifyPackagePurchase({
        client: adminClient,
        schoolId: profile.school_id,
        studentId,
        packageName: pkg.name,
        lessonCount: pkg.lesson_count,
        classroomRequired: pkg.classroom_required ?? 0,
        pricePaidCents: paid,
        totalPriceCents: price,
        discountCents: discount,
        lessonsActivated,
        requirements: pkg.requirements ?? null,
        receiptUrl: null,
      })

      return NextResponse.json(
        {
          paymentId: result.payment_id ?? null,
          purchaseId: result.purchase_id,
          lessonsActivated,
          balanceCharge: owed,
        },
        { status: 201 }
      )
    }

    // ── Mode: custom ──────────────────────────────────────
    if (mode === 'custom') {
      const lessonCount = parsed.data.lessonCount!
      const amountCents = parsed.data.amountPaidCents!

      const { data: result, error: rpcError } = await adminClient.rpc(
        'record_custom_payment',
        {
          p_school_id: profile.school_id,
          p_student_id: studentId,
          p_lesson_count: lessonCount,
          p_amount_cents: amountCents,
          p_payment_method: paymentMethod,
          p_description: description ?? null,
          p_sold_by: soldBy,
          p_recorded_by: user.id,
          p_sold_by_instructor_id: soldByInstructorId,
        }
      )

      if (rpcError || !result) {
        return serverError('payments/manual: record_custom_payment', rpcError)
      }

      return NextResponse.json({ paymentId: result.payment_id }, { status: 201 })
    }

    // ── Mode: balance ─────────────────────────────────────
    // Pay down outstanding balance. Atomic: applies to outstanding purchases
    // (oldest first, row-locked), records the payment + negative ledger entry
    // and bumps lessons in one transaction. sale_date = oldest touched purchase.
    const amount = parsed.data.amountPaidCents!

    const { data: result, error: rpcError } = await adminClient.rpc(
      'record_balance_payment',
      {
        p_school_id: profile.school_id,
        p_student_id: studentId,
        p_amount_cents: amount,
        p_payment_amount_cents: amount,
        p_payment_method: paymentMethod,
        p_ledger_payment_method: paymentMethod,
        p_card_brand: null,
        p_card_last4: null,
        p_stripe_payment_intent_id: null,
        p_receipt_url: null,
        p_description: description ?? null,
        p_sold_by: soldBy,
        p_recorded_by: user.id,
        p_sold_by_instructor_id: soldByInstructorId,
      }
    )

    if (rpcError || !result) {
      return serverError('payments/manual: record_balance_payment', rpcError)
    }

    return NextResponse.json(
      { paymentId: result.payment_id, lessonsUnlocked: result.lessons_unlocked ?? 0 },
      { status: 201 }
    )
  } catch (err) {
    return serverError('payments/manual', err)
  }
}
