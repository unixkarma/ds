// POST /api/stripe/webhook
// Handles Stripe webhook events for the school's Stripe account.
// Event: checkout.session.completed → credit lessons_remaining + record payment

import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createStripeClient } from '@/lib/stripe'

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

    // Record the payment
    await adminClient.from('payments').insert({
      school_id: schoolId,
      student_id: studentId,
      package_id: packageId || null,
      stripe_payment_intent_id: completedSession.payment_intent ?? '',
      amount_cents: amountCents,
      status: 'completed',
    })

    // Credit lessons to the student
    const { data: student } = await adminClient
      .from('students')
      .select('lessons_remaining, total_lessons_purchased')
      .eq('id', studentId)
      .single()

    if (student) {
      await adminClient
        .from('students')
        .update({
          lessons_remaining: (student.lessons_remaining ?? 0) + lessonCount,
          total_lessons_purchased: student.total_lessons_purchased + lessonCount,
        })
        .eq('id', studentId)
    }
  }

  return NextResponse.json({ received: true })
}
