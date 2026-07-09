// POST /api/broadcasts — send a bulk email to students or staff (admin only)

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthContext } from '@/lib/api-auth'
import { serverError } from '@/lib/api-error'
import { sendBroadcast } from '@/lib/services/communication'

const postSchema = z.object({
  audience: z.enum(['students', 'staff']),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(20000),
})

export async function POST(request: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = postSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  try {
    const result = await sendBroadcast(parsed.data)
    return NextResponse.json(result)
  } catch (err) {
    return serverError('POST /api/broadcasts', err)
  }
}
