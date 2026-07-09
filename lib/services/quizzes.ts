// Quiz / knowledge-test service (migration 045).
// Manages a school's quiz catalog and records per-student attempts. RLS scopes
// everything to the caller's school; API routes gate role for clean errors.

import { createClient } from '@/lib/supabase/server'
import type { Quiz, QuizAttempt, QuizAttemptWithQuiz } from '@/types'

interface Ctx {
  userId: string
  schoolId: string
  role: string
}

async function requireContext(): Promise<Ctx> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('users')
    .select('role, school_id')
    .eq('id', user.id)
    .single<{ role: string; school_id: string }>()

  if (!profile) throw new Error('Profile not found')
  return { userId: user.id, schoolId: profile.school_id, role: profile.role }
}

export async function listQuizzes(): Promise<Quiz[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('quizzes')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as Quiz[]
}

export interface CreateQuizArgs {
  title: string
  topic: string
  passing_score: number
  active: boolean
}

export async function createQuiz(args: CreateQuizArgs): Promise<Quiz> {
  const ctx = await requireContext()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('quizzes')
    .insert({
      school_id: ctx.schoolId,
      title: args.title,
      topic: args.topic,
      passing_score: args.passing_score,
      active: args.active,
    })
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return data as Quiz
}

export async function listStudentQuizAttempts(
  studentId: string,
): Promise<QuizAttemptWithQuiz[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('quiz_attempts')
    .select('*, quiz:quizzes(*)')
    .eq('student_id', studentId)
    .order('taken_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as QuizAttemptWithQuiz[]
}

export interface RecordAttemptArgs {
  studentId: string
  quizId: string
  score: number
  takenAt?: string
}

// Records a quiz attempt. `passed` is computed against the quiz's current
// passing_score and stored, so it survives later changes to that threshold.
export async function recordQuizAttempt(args: RecordAttemptArgs): Promise<QuizAttempt> {
  const ctx = await requireContext()
  const supabase = await createClient()

  const { data: quiz } = await supabase
    .from('quizzes')
    .select('passing_score')
    .eq('id', args.quizId)
    .single<{ passing_score: number }>()

  if (!quiz) throw new Error('Quiz not found')

  const { data, error } = await supabase
    .from('quiz_attempts')
    .insert({
      school_id: ctx.schoolId,
      quiz_id: args.quizId,
      student_id: args.studentId,
      score: args.score,
      passed: args.score >= quiz.passing_score,
      taken_at: args.takenAt ?? new Date().toISOString(),
      recorded_by: ctx.userId,
    })
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return data as QuizAttempt
}
