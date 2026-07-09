// GET /api/reports/attendance-sheet?sessionId=... — classroom attendance CSV (admin only)

import { NextResponse, type NextRequest } from 'next/server'
import { getAuthContext } from '@/lib/api-auth'
import { serverError } from '@/lib/api-error'
import { buildAttendanceSheet } from '@/lib/services/state-reports'

export async function GET(request: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sessionId = request.nextUrl.searchParams.get('sessionId')
  if (!sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })

  try {
    const { csv } = await buildAttendanceSheet(sessionId)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="attendance-sheet.csv"',
      },
    })
  } catch (err) {
    return serverError('GET /api/reports/attendance-sheet', err)
  }
}
