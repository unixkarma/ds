// GET /api/schedule/grid?date=YYYY-MM-DD&view=multi-instructor&instructorId=...
// Aggregated scheduler grid for admins/instructors.

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthContext } from '@/lib/api-auth'
import { serverError } from '@/lib/api-error'
import { getGridData } from '@/lib/services/schedule-grid'

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  view: z.enum(['single-instructor', 'single-location', 'multi-instructor']),
  instructorId: z.string().uuid().optional(),
})

export async function GET(request: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'admin' && ctx.role !== 'instructor') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = querySchema.safeParse({
    date: request.nextUrl.searchParams.get('date'),
    view: request.nextUrl.searchParams.get('view'),
    instructorId: request.nextUrl.searchParams.get('instructorId') ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  try {
    const data = await getGridData(parsed.data)
    return NextResponse.json(data)
  } catch (err) {
    return serverError('GET /api/schedule/grid', err)
  }
}
