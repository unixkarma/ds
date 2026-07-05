// Platform billing via Lemon Squeezy (Merchant of Record).
// Schools pay a fixed monthly subscription to use HelixDriving. This module
// wraps the Lemon Squeezy REST API + webhook verification and reads/writes the
// school_subscriptions table (migration 043).

import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const LS_API = 'https://api.lemonsqueezy.com/v1'

// Statuses that grant access on their own.
const ACTIVE_STATUSES = new Set(['on_trial', 'active', 'past_due'])

export interface SchoolSubscription {
  status: string
  ls_customer_portal_url: string | null
  current_period_end: string | null
}

/** Whether a subscription row grants dashboard access right now. `past_due`
 *  keeps access during Lemon Squeezy's payment-retry window; `cancelled` keeps
 *  access until the paid period actually ends. */
export function subscriptionHasAccess(sub: SchoolSubscription | null): boolean {
  if (!sub) return false
  if (ACTIVE_STATUSES.has(sub.status)) return true
  if (sub.status === 'cancelled' && sub.current_period_end) {
    return new Date(sub.current_period_end).getTime() > Date.now()
  }
  return false
}

/** Read the current (admin) user's school subscription. Returns null if none. */
export async function getSchoolSubscription(): Promise<SchoolSubscription | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('school_subscriptions')
    .select('status, ls_customer_portal_url, current_period_end')
    .maybeSingle()

  return (data as SchoolSubscription | null) ?? null
}

/** Create a Lemon Squeezy hosted checkout for a school and return its URL. The
 *  school_id rides along as custom data so the webhook can map the resulting
 *  subscription back to the school. */
export async function createCheckoutUrl(schoolId: string, email: string): Promise<string> {
  const apiKey = process.env.LEMONSQUEEZY_API_KEY
  const storeId = process.env.LEMONSQUEEZY_STORE_ID
  const variantId = process.env.LEMONSQUEEZY_VARIANT_ID
  if (!apiKey || !storeId || !variantId) {
    throw new Error('Lemon Squeezy is not configured (missing env vars).')
  }

  const res = await fetch(`${LS_API}/checkouts`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            email,
            custom: { school_id: schoolId },
          },
        },
        relationships: {
          store: { data: { type: 'stores', id: String(storeId) } },
          variant: { data: { type: 'variants', id: String(variantId) } },
        },
      },
    }),
  })

  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Lemon Squeezy checkout failed (${res.status}): ${detail}`)
  }

  const json = await res.json()
  const url = json?.data?.attributes?.url
  if (!url) throw new Error('Lemon Squeezy checkout returned no URL.')
  return url as string
}

/** Verify a Lemon Squeezy webhook signature (HMAC-SHA256 hex of the raw body). */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET
  if (!secret || !signature) return false

  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  const a = Buffer.from(digest, 'hex')
  const b = Buffer.from(signature, 'hex')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/** Apply a subscription-related webhook to school_subscriptions. */
export async function upsertSubscriptionFromWebhook(payload: {
  schoolId: string
  status: string
  subscriptionId: string
  customerId: string | null
  variantId: string | null
  customerPortalUrl: string | null
  currentPeriodEnd: string | null
}): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from('school_subscriptions')
    .upsert(
      {
        school_id: payload.schoolId,
        provider: 'lemonsqueezy',
        status: payload.status,
        ls_subscription_id: payload.subscriptionId,
        ls_customer_id: payload.customerId,
        ls_variant_id: payload.variantId,
        ls_customer_portal_url: payload.customerPortalUrl,
        current_period_end: payload.currentPeriodEnd,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'school_id' }
    )
}
