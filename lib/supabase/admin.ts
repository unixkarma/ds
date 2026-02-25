// Admin Supabase client — uses the service role key.
// ONLY import this in API routes (server-side). Never in Client Components.
// The service role key bypasses RLS — use with care.

import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
