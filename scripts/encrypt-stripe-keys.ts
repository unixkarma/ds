// One-time backfill: encrypt existing plaintext Stripe secrets in the `schools`
// table (stripe_secret_key + stripe_webhook_secret) with AES-256-GCM.
//
// Run: npx tsx scripts/encrypt-stripe-keys.ts
//
// Requires in .env.local:
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   STRIPE_KEY_ENCRYPTION_KEY  (openssl rand -base64 32)
//
// IDEMPOTENT: rows already in enc:v1 format are skipped, so it's safe to re-run.
// Do NOT rotate STRIPE_KEY_ENCRYPTION_KEY after running without first decrypting
// with the old key — the ciphertext is bound to the key that produced it.

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}
if (!process.env.STRIPE_KEY_ENCRYPTION_KEY) {
  console.error('Missing STRIPE_KEY_ENCRYPTION_KEY in .env.local (openssl rand -base64 32)')
  process.exit(1)
}

// Import AFTER dotenv so getKey() sees the env var.
async function main() {
  const { encryptSecret, isEncrypted } = await import('../lib/crypto')

  const admin = createClient(supabaseUrl!, serviceRoleKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: schools, error } = await admin
    .from('schools')
    .select('id, name, stripe_secret_key, stripe_webhook_secret')

  if (error) throw new Error(error.message)

  let updatedCount = 0
  for (const s of schools ?? []) {
    const update: Record<string, string> = {}

    if (s.stripe_secret_key && !isEncrypted(s.stripe_secret_key)) {
      update.stripe_secret_key = encryptSecret(s.stripe_secret_key)
    }
    if (s.stripe_webhook_secret && !isEncrypted(s.stripe_webhook_secret)) {
      update.stripe_webhook_secret = encryptSecret(s.stripe_webhook_secret)
    }

    if (Object.keys(update).length === 0) {
      console.log(`• ${s.name}: nothing to do (already encrypted or unset)`)
      continue
    }

    const { error: upErr } = await admin.from('schools').update(update).eq('id', s.id)
    if (upErr) {
      console.error(`✗ ${s.name}: ${upErr.message}`)
      continue
    }
    console.log(`✓ ${s.name}: encrypted ${Object.keys(update).join(', ')}`)
    updatedCount++
  }

  console.log(`\nDone. ${updatedCount} school(s) updated.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
