// POST /api/stripe/webhook
// Handles Stripe webhook events for the school's Stripe account.
// Event: checkout.session.completed → credit lessons_remaining + record payment

import { NextResponse, type NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { createStripeClient } from '@/lib/stripe'
import { creditLessonsForPayment } from '@/lib/services/payments'
import { createPurchase } from '@/lib/services/student-purchases'

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

  if (!school?.stripe_secret_key || !school?.stripe_webhook_secret) {
    return NextResponse.json({ error: 'School Stripe not configured' }, { status: 422 })
  }

  // Verify the webhook signature
  const stripe = createStripeClient(school.stripe_secret_key)
  let event
  try {
    event = stripe.webhooks.constructEvent(payload, sig, school.stripe_webhook_secret)
  } catch (err) {
    return NextResponse.json({ error: `Webhook signature verification failed: ${err}` }, { status: 400 })
  }

  // Handle the event
  if (event.type === 'checkout.session.completed') {
    const completedSession = event.data.object as {
      metadata: Record<string, string>
      amount_total: number
      payment_intent: string | null
    }

    const meta = completedSession.metadata
    const studentId = meta.student_id
    const packageId = meta.package_id || null
    const lessonCount = parseInt(meta.lesson_count, 10)
    const amountCents = parseInt(meta.amount_cents, 10)

    if (!studentId || isNaN(lessonCount)) {
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

    // Stripe Checkout is always paid in full at sale time, so the purchase
    // row records the full price as paid and activates all lessons.
    let packageName = 'Single Lesson'
    if (packageId) {
      const { data: pkg } = await adminClient
        .from('packages')
        .select('name')
        .eq('id', packageId)
        .single()
      if (pkg?.name) packageName = pkg.name
    }

    await createPurchase({
      client: adminClient,
      schoolId,
      studentId,
      packageId,
      packageName,
      totalLessons: lessonCount,
      priceCents: amountCents,
      amountPaidCents: amountCents,
    })

    await creditLessonsForPayment({
      adminClient,
      schoolId,
      studentId,
      packageId,
      lessonCount,
      amountCents,
      paymentMethod: paymentMethodType,
      cardBrand,
      cardLast4,
      stripePaymentIntentId: completedSession.payment_intent ?? null,
      receiptUrl,
    })
  }

  return NextResponse.json({ received: true })
}
