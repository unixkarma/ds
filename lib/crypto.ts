// Symmetric encryption for secrets at rest (Stripe secret key + webhook secret
// stored per-school in the `schools` table). AES-256-GCM (authenticated) with a
// master key held only in the environment, never in the DB.
//
// Stored format:  enc:v1:<iv_b64>:<authTag_b64>:<ciphertext_b64>
//
// The master key `STRIPE_KEY_ENCRYPTION_KEY` must decode to exactly 32 bytes.
// Generate one with:  openssl rand -base64 32
//
// BACKWARD COMPAT: decryptSecret() returns any value that is NOT in the enc:v1
// format unchanged, so legacy plaintext rows keep working until they're
// re-saved or backfilled (scripts/encrypt-stripe-keys.ts). This makes the
// rollout safe: deploy code + set the env var, then backfill, in any order.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const PREFIX = 'enc:v1:'

function getKey(): Buffer {
  const raw = process.env.STRIPE_KEY_ENCRYPTION_KEY
  if (!raw) {
    throw new Error('STRIPE_KEY_ENCRYPTION_KEY is not set')
  }
  // Accept hex (64 chars) or base64 (default).
  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error('STRIPE_KEY_ENCRYPTION_KEY must decode to 32 bytes (256-bit)')
  }
  return key
}

export function isEncrypted(v: string | null | undefined): boolean {
  return typeof v === 'string' && v.startsWith(PREFIX)
}

export function encryptSecret(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(12) // 96-bit nonce, standard for GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`
}

// Returns null for null/empty input. Returns legacy plaintext unchanged.
// Throws only if an enc:v1 value is malformed or the master key is wrong/missing.
export function decryptSecret(stored: string | null | undefined): string | null {
  if (stored == null || stored === '') return null
  if (!isEncrypted(stored)) return stored // legacy plaintext — grandfathered

  const [ivB64, tagB64, ctB64] = stored.slice(PREFIX.length).split(':')
  if (!ivB64 || !tagB64 || !ctB64) {
    throw new Error('Malformed encrypted secret')
  }
  const key = getKey()
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  const pt = Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64')),
    decipher.final(),
  ])
  return pt.toString('utf8')
}
