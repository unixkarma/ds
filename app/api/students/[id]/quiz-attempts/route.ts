// GET  /api/students/[id]/quiz-attempts — list a student's attempts
//      (admin/instructor, or the student via RLS)
// POST /api/students/[id]/quiz-attempts — record an attempt (admin/instructor)

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthContext } from '@/lib/api-auth'
import { serverError } from '@/lib/api-error'
import { listStudentQuizAttempts, recordQuizAttempt } from '@/lib/services/quizzes'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: studentId } = await params
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const attempts = await listStudentQuizAttempts(studentId)
    return NextResponse.json({ attempts })
  } catch (err) {
    return serverError('GET /api/students/[id]/quiz-attempts', err)
  }
}

const postSchema = z.object({
  quizId: z.string().uuid(),
  score: z.number().int().min(0).max(100),
  takenAt: z.string().datetime().optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: studentId } = await params
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'admin' && ctx.role !== 'instructor') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = postSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  try {
    const attempt = await recordQuizAttempt({
      studentId,
      quizId: parsed.data.quizId,
      score: parsed.data.score,
      takenAt: parsed.data.takenAt,
    })
    return NextResponse.json({ attempt })
  } catch (err) {
    return serverError('POST /api/students/[id]/quiz-attempts', err)
  }
}
