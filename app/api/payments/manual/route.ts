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
import { creditLessonsForPayment } from '@/lib/services/payments'
import { insertLedgerEntry } from '@/lib/services/student-ledger'
import {
  applyPaymentToPurchases,
  bumpStudentLessons,
  createPurchase,
} from '@/lib/services/student-purchases'

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
  })
  .superRefine((v, ctx) => {
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

  try {
    // ── Mode: package ─────────────────────────────────────
    if (mode === 'package') {
      const { data: pkg } = await adminClient
        .from('packages')
        .select('id, school_id, name, lesson_count, price_cents')
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
      const owed = effectivePrice - paid

      // 1. Create the purchase. Returns the proportional lessons to activate.
      const { id: purchaseId, lessonsActivated } = await createPurchase({
        client: adminClient,
        schoolId: profile.school_id,
        studentId,
        packageId: pkg.id,
        packageName: pkg.name,
        totalLessons: pkg.lesson_count,
        priceCents: price,
        discountCents: discount,
        amountPaidCents: paid,
      })

      // 2. Record the payment + bump lessons (only the activated portion)
      let paymentId: string | null = null
      if (paid > 0) {
        const result = await creditLessonsForPayment({
          adminClient,
          schoolId: profile.school_id,
          studentId,
          packageId: pkg.id,
          lessonCount: lessonsActivated,
          amountCents: paid,
          paymentMethod,
          description: description ?? null,
          discountCents: discount,
        })
        paymentId = result.paymentId
      }
      // For paid == 0 (unpaid): no payment row, lessonsActivated is 0 by definition.

      // 3. Insert ledger charge for the unpaid portion (if any)
      if (owed > 0) {
        await insertLedgerEntry({
          client: adminClient,
          schoolId: profile.school_id,
          studentId,
          amountCents: owed,
          entryType: 'charge',
          description: description?.trim() || `Pending balance — ${pkg.name}`,
          packageId: pkg.id,
          createdBy: user.id,
        })
      }

      return NextResponse.json(
        { paymentId, purchaseId, lessonsActivated, balanceCharge: owed },
        { status: 201 }
      )
    }

    // ── Mode: custom ──────────────────────────────────────
    if (mode === 'custom') {
      const lessonCount = parsed.data.lessonCount!
      const amountCents = parsed.data.amountPaidCents!

      const result = await creditLessonsForPayment({
        adminClient,
        schoolId: profile.school_id,
        studentId,
        packageId: null,
        lessonCount,
        amountCents,
        paymentMethod,
        description: description ?? null,
      })

      return NextResponse.json({ paymentId: result.paymentId }, { status: 201 })
    }

    // ── Mode: balance ─────────────────────────────────────
    // Pay down outstanding balance. Applies to outstanding purchases (oldest
    // first), unlocking lessons proportionally. Records a payment row + a
    // negative ledger entry. sale_date = the oldest touched purchase, or now.
    const amount = parsed.data.amountPaidCents!

    const apply = await applyPaymentToPurchases(adminClient, studentId, amount)
    const saleDate = apply.oldestSaleDate ?? new Date().toISOString()

    const { data: payment, error: paymentError } = await adminClient
      .from('payments')
      .insert({
        school_id: profile.school_id,
        student_id: studentId,
        package_id: null,
        stripe_payment_intent_id: null,
        amount_cents: amount,
        status: 'completed',
        payment_method: paymentMethod,
        description: description ?? null,
        sale_date: saleDate,
      })
      .select('id')
      .single()

    if (paymentError || !payment) {
      throw new Error(paymentError?.message ?? 'Failed to record payment')
    }

    await insertLedgerEntry({
      client: adminClient,
      schoolId: profile.school_id,
      studentId,
      amountCents: -amount,
      entryType: 'payment',
      description: description?.trim() || 'Balance payment',
      paymentMethod,
      paymentId: payment.id,
      createdBy: user.id,
    })

    if (apply.lessonsUnlocked > 0) {
      await bumpStudentLessons(adminClient, studentId, apply.lessonsUnlocked)
    }

    return NextResponse.json(
      { paymentId: payment.id, lessonsUnlocked: apply.lessonsUnlocked },
      { status: 201 }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to record payment'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
