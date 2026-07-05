// POST /api/billing/webhook — Lemon Squeezy platform-billing webhook.
// Exempt from auth in middleware.ts. Verifies the X-Signature HMAC, then syncs
// the school's subscription status into school_subscriptions.

import { NextResponse, type NextRequest } from 'next/server'
import {
  verifyWebhookSignature,
  upsertSubscriptionFromWebhook,
} from '@/lib/services/billing'

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-signature')

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let event: {
    meta?: { event_name?: string; custom_data?: { school_id?: string } }
    data?: {
      type?: string
      id?: string
      attributes?: Record<string, unknown>
    }
  }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventName = event.meta?.event_name ?? ''

  // We only track subscription lifecycle. Payment events (subscription-invoices)
  // are acknowledged; the matching subscription_updated carries the new status.
  if (!eventName.startsWith('subscription_') || event.data?.type !== 'subscriptions') {
    return NextResponse.json({ received: true })
  }

  const schoolId = event.meta?.custom_data?.school_id
  if (!schoolId) {
    // Nothing to map this subscription to — ack so Lemon Squeezy stops retrying.
    return NextResponse.json({ received: true, note: 'no school_id in custom_data' })
  }

  const attrs = event.data?.attributes ?? {}
  const status = (attrs.status as string) ?? 'none'
  const endsAt = (attrs.ends_at as string | null) ?? null
  const renewsAt = (attrs.renews_at as string | null) ?? null
  const urls = attrs.urls as { customer_portal?: string } | undefined

  await upsertSubscriptionFromWebhook({
    schoolId,
    status,
    subscriptionId: String(event.data?.id ?? ''),
    customerId: attrs.customer_id != null ? String(attrs.customer_id) : null,
    variantId: attrs.variant_id != null ? String(attrs.variant_id) : null,
    customerPortalUrl: urls?.customer_portal ?? null,
    // When cancelled, access runs until ends_at; otherwise until the next renewal.
    currentPeriodEnd: endsAt ?? renewsAt,
  })

  return NextResponse.json({ received: true })
}
