// Supabase Auth callback handler
// This route is used for two flows:
//   1. Email confirmation after registration
//   2. Password reset (exchanges the recovery token for a session)
//
// Supabase sends the user here with a `code` query param.
// We exchange it for a session, then redirect to the intended destination.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)

  const code = searchParams.get('code')
  // `next` is an optional redirect destination (e.g. /auth/update-password)
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Something went wrong — send back to login with an error hint
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
