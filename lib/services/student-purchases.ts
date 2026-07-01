// Student purchases — one row per package sale. Lessons activate proportionally:
//   effective_price       = price_cents - discount_cents
//   lessons_activated     = floor(amount_paid_cents * total_lessons / effective_price)
// As balance payments come in, lessons_activated grows and student.lessons_remaining
// is bumped by the delta. Custom payments and manual ledger adjustments DO NOT
// create purchase rows.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { StudentPurchase, PaymentSoldBy } from '@/types'

// ── Read ─────────────────────────────────────────────────────

export async function getStudentPurchases(
  studentId: string
): Promise<StudentPurchase[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('student_purchases')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as StudentPurchase[]
}

// ── Write ────────────────────────────────────────────────────

function computeActivated(
  amountPaidCents: number,
  effectivePriceCents: number,
  totalLessons: number
): number {
  if (effectivePriceCents <= 0) return totalLessons
  if (amountPaidCents <= 0) return 0
  if (amountPaidCents >= effectivePriceCents) return totalLessons
  return Math.floor((amountPaidCents * totalLessons) / effectivePriceCents)
}

export interface CreatePurchaseArgs {
  client: SupabaseClient
  schoolId: string
  studentId: string
  packageId: string | null
  packageName: string
  totalLessons: number
  priceCents: number
  amountPaidCents: number
  discountCents?: number
  classroomRequired?: number
  requirements?: string | null
  soldBy?: PaymentSoldBy | null
  recordedBy?: string | null
  soldByInstructorId?: string | null
}

// Inserts a new purchase row and returns the number of lessons that should
// be added to students.lessons_remaining / total_lessons_purchased.
//
// @deprecated NON-ATOMIC — do not use in payment flows. The webhook + manual
// payment routes now use the atomic `record_package_purchase` /
// `record_balance_payment` RPCs (migration 039). Using this again reintroduces
// the partial-failure / lost-update billing bugs. Read-only callers only.
export async function createPurchase(args: CreatePurchaseArgs): Promise<{
  id: string
  lessonsActivated: number
}> {
  const {
    client,
    schoolId,
    studentId,
    packageId,
    packageName,
    totalLessons,
    priceCents,
    amountPaidCents,
    discountCents = 0,
    classroomRequired = 0,
    requirements = null,
    soldBy = null,
    recordedBy = null,
    soldByInstructorId = null,
  } = args

  const effectivePrice = priceCents - discountCents
  const lessonsActivated = computeActivated(amountPaidCents, effectivePrice, totalLessons)

  const { data, error } = await client
    .from('student_purchases')
    .insert({
      school_id: schoolId,
      student_id: studentId,
      package_id: packageId,
      package_name: packageName,
      total_lessons: totalLessons,
      lessons_activated: lessonsActivated,
      price_cents: priceCents,
      discount_cents: discountCents,
      amount_paid_cents: amountPaidCents,
      classroom_required: classroomRequired,
      requirements,
      sold_by: soldBy,
      recorded_by: recordedBy,
      sold_by_instructor_id: soldByInstructorId,
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to create purchase')
  }

  return { id: data.id, lessonsActivated }
}

export interface ApplyPaymentResult {
  lessonsUnlocked: number       // delta to add to students.lessons_remaining
  appliedCents: number          // amount actually applied to purchases (rest is credit overflow)
  oldestSaleDate: string | null // created_at of the first purchase touched (for sale_date)
}

// @deprecated NON-ATOMIC — superseded by the `record_balance_payment` RPC
// (migration 039). Do not use in payment flows; it has a concurrent
// double-apply race the RPC fixes with FOR UPDATE.
// Walk outstanding purchases for a student (oldest first) and apply the payment.
// Each purchase grows amount_paid_cents and lessons_activated proportionally.
// Returns:
//   - lessonsUnlocked: sum of (new_activated - old_activated) across purchases
//   - appliedCents:    how much of `amountCents` was actually applied (may be
//                      less than amountCents if no outstanding balance exists)
//   - oldestSaleDate:  created_at of the first touched purchase (or null)
export async function applyPaymentToPurchases(
  client: SupabaseClient,
  studentId: string,
  amountCents: number
): Promise<ApplyPaymentResult> {
  if (amountCents <= 0) {
    return { lessonsUnlocked: 0, appliedCents: 0, oldestSaleDate: null }
  }

  const { data: purchases, error } = await client
    .from('student_purchases')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)

  let remaining = amountCents
  let lessonsUnlocked = 0
  let appliedTotal = 0
  let oldestSaleDate: string | null = null

  for (const p of (purchases ?? []) as StudentPurchase[]) {
    if (remaining <= 0) break
    const effectivePrice = p.price_cents - (p.discount_cents ?? 0)
    const owed = effectivePrice - p.amount_paid_cents
    if (owed <= 0) continue

    const applied = Math.min(remaining, owed)
    const newPaid = p.amount_paid_cents + applied
    const newActivated = computeActivated(newPaid, effectivePrice, p.total_lessons)
    const delta = newActivated - p.lessons_activated

    const { error: updateErr } = await client
      .from('student_purchases')
      .update({
        amount_paid_cents: newPaid,
        lessons_activated: newActivated,
      })
      .eq('id', p.id)

    if (updateErr) throw new Error(updateErr.message)

    if (oldestSaleDate === null) oldestSaleDate = p.created_at
    lessonsUnlocked += delta
    remaining -= applied
    appliedTotal += applied
  }

  return { lessonsUnlocked, appliedCents: appliedTotal, oldestSaleDate }
}

// @deprecated NON-ATOMIC read-modify-write on lessons_remaining — superseded by
// the atomic UPDATEs inside the migration-039 RPCs. Do not use in payment flows.
export async function bumpStudentLessons(
  client: SupabaseClient,
  studentId: string,
  delta: number
): Promise<void> {
  if (delta === 0) return

  const { data: s, error: readErr } = await client
    .from('students')
    .select('lessons_remaining, total_lessons_purchased')
    .eq('id', studentId)
    .single()

  if (readErr || !s) throw new Error(readErr?.message ?? 'Student not found')

  const { error: updateErr } = await client
    .from('students')
    .update({
      lessons_remaining: (s.lessons_remaining ?? 0) + delta,
      total_lessons_purchased: s.total_lessons_purchased + delta,
    })
    .eq('id', studentId)

  if (updateErr) throw new Error(updateErr.message)
}
