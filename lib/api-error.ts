// Centralized API error response helper.
//
// Returning raw `error.message` from Postgres/Supabase to the client leaks
// internal schema (table/column names, constraint names) to attackers. Use
// `serverError()` for anything that is an *internal* failure: it logs the full
// detail server-side (visible in Vercel logs / your error tracker) and returns
// a generic, safe payload to the caller.
//
// For *client* errors (bad input, forbidden, not found) keep returning specific
// messages — those are safe and useful. This helper is only for 5xx-class
// internal failures.

import { NextResponse } from 'next/server'

export function serverError(
  context: string,
  detail: unknown,
  status = 500
): NextResponse {
  // Structured server-side log. Replace console with Sentry/Datadog when the
  // error-tracking integration lands.
  console.error(`[api-error] ${context}:`, detail)

  return NextResponse.json(
    { error: 'Something went wrong. Please try again.' },
    { status }
  )
}
