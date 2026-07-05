// Settings service — fetch the current school's configuration.
// Used by the admin Settings page.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { School } from '@/types'

export async function getSchoolSettings(): Promise<School> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('users')
    .select('school_id')
    .eq('id', user.id)
    .single()

  if (!profile) throw new Error('Profile not found')

  // Read with the service-role client so the Stripe secrets never travel over a
  // browser-reachable query, then strip them before returning. Scoped to the
  // caller's own school_id, so there is no cross-tenant exposure. The client
  // only needs to know whether each secret is set, exposed as booleans.
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('schools')
    .select('*')
    .eq('id', profile.school_id)
    .single()

  if (error) throw new Error(error.message)

  const { stripe_secret_key, stripe_webhook_secret, ...safe } = data
  return {
    ...safe,
    stripe_secret_key: null,
    stripe_webhook_secret: null,
    has_stripe_secret_key: Boolean(stripe_secret_key),
    has_stripe_webhook_secret: Boolean(stripe_webhook_secret),
  } as School
}
