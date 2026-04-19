// Helper to generate a signed URL for a permit photo stored in the
// PRIVATE `permit-photos` bucket.
//
// The `students.permit_photo_url` column stores the STORAGE PATH
// (e.g. `{user_id}/permit.jpg`), not a URL. Migration 018 privatized
// the bucket and converted any pre-existing public URLs to paths.

import { createAdminClient } from '@/lib/supabase/admin'

const SIGNED_URL_TTL_SECONDS = 60 * 60 // 1 hour

export async function getPermitPhotoSignedUrl(
  path: string | null | undefined,
): Promise<string | null> {
  if (!path) return null

  // Legacy defensive: if the column still holds a full URL (shouldn't
  // happen after migration 018 runs, but defensive during the rollout
  // window), strip the prefix so createSignedUrl gets a clean path.
  const cleanPath = path.includes('/permit-photos/')
    ? path.replace(/^.*?\/permit-photos\//, '')
    : path

  const adminClient = createAdminClient()
  const { data, error } = await adminClient.storage
    .from('permit-photos')
    .createSignedUrl(cleanPath, SIGNED_URL_TTL_SECONDS)

  if (error || !data) return null
  return data.signedUrl
}
