// GET /api/reports/staff-time-off?start=YYYY-MM-DD&end=YYYY-MM-DD — staff time-off CSV (admin only)

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthContext } from '@/lib/api-auth'
import { serverError } from '@/lib/api-error'
import { buildStaffTimeOffReport } from '@/lib/services/state-reports'

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export async function GET(request: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const start = dateSchema.safeParse(request.nextUrl.searchParams.get('start'))
  const end = dateSchema.safeParse(request.nextUrl.searchParams.get('end'))
  if (!start.success || !end.success) {
    return NextResponse.json({ error: 'start and end (YYYY-MM-DD) are required' }, { status: 400 })
  }

  try {
    const { csv } = await buildStaffTimeOffReport(start.data, end.data)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="staff-time-off.csv"',
      },
    })
  } catch (err) {
    return serverError('GET /api/reports/staff-time-off', err)
  }
}
