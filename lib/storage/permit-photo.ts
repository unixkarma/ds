// Permit photos live in the PRIVATE "permit-photos" bucket. We store the bare
// storage path ({user_id}/permit.{ext}) on students.permit_photo_url and mint a
// short-lived signed URL whenever the image needs to be displayed. This helper
// also tolerates legacy rows that still hold a full public URL.

import { createAdminClient } from '@/lib/supabase/admin'

const BUCKET = 'permit-photos'
const MARKER = `/${BUCKET}/`

/** Extract the storage path from a stored value that may be a bare path or a
 *  legacy full public URL. */
export function permitPhotoPath(stored: string | null | undefined): string | null {
  if (!stored) return null
  const i = stored.indexOf(MARKER)
  return i === -1 ? stored : stored.slice(i + MARKER.length)
}

/** Mint a short-lived signed URL for a stored permit photo, or null if there is
 *  none / it can't be signed. */
export async function getPermitPhotoSignedUrl(
  stored: string | null | undefined
): Promise<string | null> {
  const path = permitPhotoPath(stored)
  if (!path) return null

  const admin = createAdminClient()
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 5) // 5 minutes

  if (error || !data) return null
  return data.signedUrl
}
