// Instructor service — server-side data fetching.
// All queries are scoped to the current user's school via RLS.

import { createClient } from '@/lib/supabase/server'
import type { InstructorWithUser, InstructorWithUserAndAvailability, Lesson, StudentWithUser, Vehicle } from '@/types'

export async function getInstructors(): Promise<InstructorWithUser[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('instructors')
    .select('*, user:users(*)')
    .order('is_active', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as InstructorWithUser[]
}

// Lesson type for instructor detail — includes student info but not redundant instructor info
export type LessonWithStudent = Lesson & {
  student: StudentWithUser
  vehicle: Vehicle | null
}

export async function getInstructorById(id: string): Promise<{
  instructor: InstructorWithUserAndAvailability
  upcomingLessons: LessonWithStudent[]
}> {
  const supabase = await createClient()

  const [instructorResult, lessonsResult] = await Promise.all([
    supabase
      .from('instructors')
      .select('*, user:users(*), availability(*)')
      .eq('id', id)
      .single(),

    supabase
      .from('lessons')
      .select('*, student:students(*, user:users!user_id(*)), vehicle:vehicles(*)')
      .eq('instructor_id', id)
      .eq('status', 'scheduled')
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(10),
  ])

  if (instructorResult.error) throw new Error(instructorResult.error.message)

  return {
    instructor: instructorResult.data as unknown as InstructorWithUserAndAvailability,
    upcomingLessons: (lessonsResult.data ?? []) as unknown as LessonWithStudent[],
  }
}
