// GET  /api/messages?studentId=... — list a student's messages (admin, or the
//      student themselves via RLS)
// POST /api/messages — send an email to a student and log it (admin only)

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthContext } from '@/lib/api-auth'
import { serverError } from '@/lib/api-error'
import { listStudentMessages, sendStudentMessage } from '@/lib/services/communication'

export async function GET(request: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const studentId = request.nextUrl.searchParams.get('studentId')
  if (!studentId) return NextResponse.json({ error: 'studentId is required' }, { status: 400 })

  try {
    const messages = await listStudentMessages(studentId)
    return NextResponse.json({ messages })
  } catch (err) {
    return serverError('GET /api/messages', err)
  }
}

const postSchema = z.object({
  studentId: z.string().uuid(),
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
    const message = await sendStudentMessage({
      studentId: parsed.data.studentId,
      subject: parsed.data.subject,
      body: parsed.data.body,
    })
    return NextResponse.json({ message })
  } catch (err) {
    return serverError('POST /api/messages', err)
  }
}
