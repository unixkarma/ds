// GET /api/health — lightweight liveness/readiness probe for uptime monitors
// and Vercel health checks. Public (excluded from auth middleware). Performs a
// cheap round-trip to the database so a green result means "app + DB reachable",
// not just "process is up". Never leaks internal error detail to the caller.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const admin = createAdminClient()
    // HEAD count against a tiny table — no rows returned, just checks the DB
    // answers. `schools` always exists and is small.
    const { error } = await admin
      .from('schools')
      .select('id', { count: 'exact', head: true })

    if (error) {
      return NextResponse.json(
        { status: 'degraded', db: 'error' },
        { status: 503 }
      )
    }

    return NextResponse.json({ status: 'ok', db: 'ok' }, { status: 200 })
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 503 })
  }
}
