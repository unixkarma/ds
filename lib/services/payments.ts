// Payment service — server-side data fetching + credit helpers.
// All read queries are automatically scoped to the current user's school via RLS.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { PaymentWithRelations, PaymentSoldBy } from '@/types'

export async function getPayments(): Promise<PaymentWithRelations[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('payments')
    .select('*, student:students(*, user:users!user_id(*)), package:packages(*)')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as PaymentWithRelations[]
}

export interface CreditLessonsArgs {
  adminClient: SupabaseClient
  schoolId: string
  studentId: string
  packageId: string | null
  lessonCount: number
  amountCents: number
  paymentMethod: string
  cardBrand?: string | null
  cardLast4?: string | null
  stripePaymentIntentId?: string | null
  receiptUrl?: string | null
  description?: string | null
  discountCents?: number        // snapshot of the package discount applied at sale time
  saleDate?: string | null      // ISO timestamp; defaults to now() in DB when omitted
  soldBy?: PaymentSoldBy | null         // who originated the sale (online/operator/instructor)
  recordedBy?: string | null            // user id of the admin/operator who recorded it
  soldByInstructorId?: string | null    // instructor credited with the sale, if any
}

// Records a completed payment and credits the student's lesson balance.
//
// @deprecated NON-ATOMIC (separate payment insert + read-modify-write on
// lessons_remaining) — superseded by the atomic `record_package_purchase` /
// `record_custom_payment` RPCs (migration 039). Do not reuse in payment flows.
export async function creditLessonsForPayment(
  args: CreditLessonsArgs
): Promise<{ paymentId: string }> {
  const {
    adminClient,
    schoolId,
    studentId,
    packageId,
    lessonCount,
    amountCents,
    paymentMethod,
    cardBrand = null,
    cardLast4 = null,
    stripePaymentIntentId = null,
    receiptUrl = null,
    description = null,
    discountCents = 0,
    saleDate = null,
    soldBy = null,
    recordedBy = null,
    soldByInstructorId = null,
  } = args

  const insertRow: Record<string, unknown> = {
    school_id: schoolId,
    student_id: studentId,
    package_id: packageId,
    stripe_payment_intent_id: stripePaymentIntentId,
    amount_cents: amountCents,
    discount_cents: discountCents,
    status: 'completed',
    payment_method: paymentMethod,
    card_brand: cardBrand,
    card_last4: cardLast4,
    receipt_url: receiptUrl,
    description,
    sold_by: soldBy,
    recorded_by: recordedBy,
    sold_by_instructor_id: soldByInstructorId,
  }
  if (saleDate) insertRow.sale_date = saleDate

  const { data: payment, error: paymentError } = await adminClient
    .from('payments')
    .insert(insertRow)
    .select('id')
    .single()

  if (paymentError || !payment) {
    throw new Error(paymentError?.message ?? 'Failed to record payment')
  }

  const { data: student, error: studentError } = await adminClient
    .from('students')
    .select('lessons_remaining, total_lessons_purchased')
    .eq('id', studentId)
    .single()

  if (studentError || !student) {
    throw new Error(studentError?.message ?? 'Student not found')
  }

  const { error: updateError } = await adminClient
    .from('students')
    .update({
      lessons_remaining: (student.lessons_remaining ?? 0) + lessonCount,
      total_lessons_purchased: student.total_lessons_purchased + lessonCount,
    })
    .eq('id', studentId)

  if (updateError) {
    throw new Error(updateError.message)
  }

  return { paymentId: payment.id }
}
