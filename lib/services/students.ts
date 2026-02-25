// Student service — server-side data fetching.
// All queries are automatically scoped to the current user's school via RLS.

import { createClient } from '@/lib/supabase/server'
import type { StudentWithUser, LessonWithRelations } from '@/types'

// Return all students for the current school, with their user profile.
export async function getStudents(): Promise<StudentWithUser[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('students')
    .select('*, user:users!user_id(*)')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as StudentWithUser[]
}

// Return a single student with user profile + last 10 lessons.
export async function getStudentById(id: string): Promise<{
  student: StudentWithUser
  lessons: LessonWithRelations[]
}> {
  const supabase = await createClient()

  const [studentResult, lessonsResult] = await Promise.all([
    supabase
      .from('students')
      .select('*, user:users!user_id(*)')
      .eq('id', id)
      .single(),

    supabase
      .from('lessons')
      .select(
        `*, instructor:instructors(*, user:users(*)), vehicle:vehicles(*)`
      )
      .eq('student_id', id)
      .order('scheduled_at', { ascending: false })
      .limit(10),
  ])

  if (studentResult.error) throw new Error(studentResult.error.message)

  return {
    student: studentResult.data as unknown as StudentWithUser,
    lessons: (lessonsResult.data ?? []) as unknown as LessonWithRelations[],
  }
}
