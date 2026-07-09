// GET /api/reports/state-roster — IL SOS student roster CSV (admin only).
// Also records the export in state_report_submissions.

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/api-auth'
import { serverError } from '@/lib/api-error'
import { buildIlSosRoster } from '@/lib/services/state-reports'

export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { csv } = await buildIlSosRoster()
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="il-sos-roster.csv"',
      },
    })
  } catch (err) {
    return serverError('GET /api/reports/state-roster', err)
  }
}
