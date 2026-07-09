// GET  /api/quizzes — list the school's quizzes (admin/instructor)
// POST /api/quizzes — create a quiz (admin only)

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthContext } from '@/lib/api-auth'
import { serverError } from '@/lib/api-error'
import { createQuiz, listQuizzes } from '@/lib/services/quizzes'

export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'admin' && ctx.role !== 'instructor') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const quizzes = await listQuizzes()
    return NextResponse.json({ quizzes })
  } catch (err) {
    return serverError('GET /api/quizzes', err)
  }
}

const postSchema = z.object({
  title: z.string().min(1).max(200),
  topic: z.string().max(200).default(''),
  passing_score: z.number().int().min(0).max(100).default(80),
  active: z.boolean().default(true),
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
    const quiz = await createQuiz(parsed.data)
    return NextResponse.json({ quiz })
  } catch (err) {
    return serverError('POST /api/quizzes', err)
  }
}
