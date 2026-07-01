// POST /api/stripe/webhook
// Handles Stripe webhook events for the school's Stripe account.
// Event: checkout.session.completed
//   mode='package' (default): credit lessons_remaining + record payment + create purchase row
//   mode='balance':            apply payment to outstanding purchases (oldest first),
//                              record payment, ledger entry, bump lessons

import { NextResponse, type NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { createStripeClient } from '@/lib/stripe'
import { serverError } from '@/lib/api-error'
import { decryptSecret } from '@/lib/crypto'
import { notifyPackagePurchase } from '@/lib/email/send-package-confirmation'

export async function POST(request: NextRequest) {
  const payload = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  // The webhook carries the school_id in metadata — use it to find the school's webhook secret
  // We parse the payload once (unverified) only to get school_id, then re-verify with the school's secret
  let rawEvent: { type: string; data: { object: Record<string, unknown> } }
  try {
    rawEvent = JSON.parse(payload)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const session = rawEvent.data.object as {
    metadata?: Record<string, string>
    payment_intent?: string
    amount_total?: number
    payment_status?: string
  }

  const schoolId = session.metadata?.school_id
  if (!schoolId) {
    // Not one of our events — ignore gracefully
    return NextResponse.json({ received: true })
  }

  const adminClient = createAdminClient()

  // Fetch the school's webhook secret to verify the signature
  const { data: school } = await adminClient
    .from('schools')
    .select('stripe_secret_key, stripe_webhook_secret')
    .eq('id', schoolId)
    .single()

  const secretKey = decryptSecret(school?.stripe_secret_key)
  const webhookSecret = decryptSecret(school?.stripe_webhook_secret)
  if (!secretKey || !webhookSecret) {
    return NextResponse.json({ error: 'School Stripe not configured' }, { status: 422 })
  }

  // Verify the webhook signature
  const stripe = createStripeClient(secretKey)
  let event
  try {
    event = stripe.webhooks.constructEvent(payload, sig, webhookSecret)
  } catch (err) {
    return serverError('stripe/webhook: signature verification failed', err, 400)
  }

  // Handle the event
  if (event.type === 'checkout.session.completed') {
    const completedSession = event.data.object as {
      metadata: Record<string, string>
      amount_total: number
      payment_intent: string | null
    }

    const meta = completedSession.metadata
    // Default to 'package' for any legacy session that predates the balance mode.
    const mode = (meta.mode === 'balance' ? 'balance' : 'package') as 'package' | 'balance'
    const studentId = meta.student_id
    const amountCents = parseInt(meta.amount_cents, 10)
    const surchargeCentsRaw = parseInt(meta.surcharge_cents ?? '0', 10)
    const surchargeCents = isNaN(surchargeCentsRaw) ? 0 : surchargeCentsRaw
    // Stripe `amount_total` is the gross actually charged (base + fee).
    const grossAmountCents = completedSession.amount_total ?? (amountCents + surchargeCents)

    if (!studentId || isNaN(amountCents)) {
      return NextResponse.json({ error: 'Missing metadata' }, { status: 400 })
    }

    // Pull payment method + receipt URL from Stripe so the revenue report
    // can show "Visa •••• 4242" and the student account page can deep-link.
    let paymentMethodType: string = 'card'
    let cardBrand: string | null = null
    let cardLast4: string | null = null
    let receiptUrl: string | null = null
    if (completedSession.payment_intent) {
      try {
        const intent = await stripe.paymentIntents.retrieve(
          completedSession.payment_intent,
          { expand: ['payment_method', 'latest_charge'] },
        )
        const pm = intent.payment_method
        if (pm && typeof pm !== 'string') {
          paymentMethodType = pm.type
          if (pm.card) {
            cardBrand = pm.card.brand ?? null
            cardLast4 = pm.card.last4 ?? null
          }
        }
        const charge = intent.latest_charge as Stripe.Charge | string | null
        if (charge && typeof charge !== 'string') {
          receiptUrl = charge.receipt_url ?? null
        }
      } catch {
        // Non-fatal: keep going with nulls so we still record the sale.
      }
    }

    // ── Balance payment: pay down outstanding purchases ─────────────
    // Atomic + idempotent: the RPC records the payment (keyed on the UNIQUE
    // stripe_payment_intent_id), applies it to purchases, writes the ledger
    // entry and bumps lessons — all in one transaction. A Stripe retry returns
    // { duplicate: true } and nothing is applied twice.
    if (mode === 'balance') {
      const { data: result, error: rpcError } = await adminClient.rpc(
        'record_balance_payment',
        {
          p_school_id: schoolId,
          p_student_id: studentId,
          p_amount_cents: amountCents,
          p_payment_amount_cents: grossAmountCents,
          p_payment_method: paymentMethodType,
          p_ledger_payment_method: 'stripe',
          p_card_brand: cardBrand,
          p_card_last4: cardLast4,
          p_stripe_payment_intent_id: completedSession.payment_intent,
          p_receipt_url: receiptUrl,
          p_description: 'Balance payment (card)',
          p_sold_by: 'online',
          p_recorded_by: null,
          p_sold_by_instructor_id: null,
        }
      )

      if (rpcError) {
        return serverError('stripe/webhook: record_balance_payment', rpcError)
      }
      if (result?.duplicate) {
        return NextResponse.json({ received: true, duplicate: true })
      }
      return NextResponse.json({ received: true })
    }

    // ── Package purchase: existing flow ─────────────────────────────
    const packageId = meta.package_id || null
    const lessonCount = parseInt(meta.lesson_count, 10)

    if (isNaN(lessonCount)) {
      return NextResponse.json({ error: 'Missing lesson_count' }, { status: 400 })
    }

    // Stripe Checkout is always paid in full at sale time, so the purchase
    // row records the full price as paid and activates all lessons.
    let packageName = 'Single Lesson'
    let classroomRequired = 0
    let requirements: string | null = null
    if (packageId) {
      const { data: pkg } = await adminClient
        .from('packages')
        .select('name, classroom_required, requirements')
        .eq('id', packageId)
        .single()
      if (pkg?.name) packageName = pkg.name
      classroomRequired = pkg?.classroom_required ?? 0
      requirements = pkg?.requirements ?? null
    }

    // Atomic + idempotent: the RPC records the payment (GROSS = base + card
    // surcharge, keyed on the UNIQUE stripe_payment_intent_id), creates the
    // purchase and credits lessons in one transaction. Stripe Checkout is
    // always paid in full, so all lessons activate. A retry returns duplicate.
    const { data: result, error: rpcError } = await adminClient.rpc(
      'record_package_purchase',
      {
        p_school_id: schoolId,
        p_student_id: studentId,
        p_package_id: packageId,
        p_package_name: packageName,
        p_total_lessons: lessonCount,
        p_price_cents: amountCents,
        p_discount_cents: 0,
        p_purchase_paid_cents: amountCents,
        p_payment_amount_cents: grossAmountCents,
        p_classroom_required: classroomRequired,
        p_requirements: requirements,
        p_payment_method: paymentMethodType,
        p_card_brand: cardBrand,
        p_card_last4: cardLast4,
        p_stripe_payment_intent_id: completedSession.payment_intent ?? null,
        p_receipt_url: receiptUrl,
        p_description: null,
        p_sold_by: 'online',
        p_recorded_by: null,
        p_sold_by_instructor_id: null,
      }
    )

    if (rpcError) {
      return serverError('stripe/webhook: record_package_purchase', rpcError)
    }
    if (result?.duplicate) {
      return NextResponse.json({ received: true, duplicate: true })
    }

    // Fire-and-forget confirmation email. Paid in full → all lessons activated.
    void notifyPackagePurchase({
      client: adminClient,
      schoolId,
      studentId,
      packageName,
      lessonCount,
      classroomRequired,
      pricePaidCents: amountCents,
      totalPriceCents: amountCents,
      discountCents: 0,
      surchargeCents,
      lessonsActivated: lessonCount,
      requirements,
      receiptUrl,
    })
  }

  return NextResponse.json({ received: true })
}
