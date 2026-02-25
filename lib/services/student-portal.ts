// Student portal service — server-side data fetching scoped to the logged-in student.
// RLS ensures students can only see their own records.

import { createClient } from '@/lib/supabase/server'
import type { StudentWithUser, LessonWithRelations } from '@/types'

export interface StudentPortalData {
  student: StudentWithUser
  upcomingLessons: LessonWithRelations[]
  recentLessons: LessonWithRelations[]
  schoolName: string
}

export async function getStudentPortalData(): Promise<StudentPortalData | null> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  // Fetch student record for the current user
  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('*, user:users!user_id(*)')
    .eq('user_id', user.id)
    .single()

  if (studentError || !student) return null

  // Fetch school name
  const { data: school } = await supabase
    .from('schools')
    .select('name')
    .eq('id', (student.user as unknown as { school_id: string }).school_id ?? student.school_id)
    .single()

  const now = new Date().toISOString()
  const lessonSelect = `
    *,
    student:students(*, user:users!user_id(*)),
    instructor:instructors(*, user:users(*)),
    vehicle:vehicles(*)
  `

  // Upcoming scheduled lessons
  const { data: upcoming } = await supabase
    .from('lessons')
    .select(lessonSelect)
    .eq('student_id', student.id)
    .eq('status', 'scheduled')
    .gte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(5)

  // Recent past lessons (completed / cancelled / no_show)
  const { data: recent } = await supabase
    .from('lessons')
    .select(lessonSelect)
    .eq('student_id', student.id)
    .in('status', ['completed', 'cancelled', 'no_show'])
    .order('scheduled_at', { ascending: false })
    .limit(10)

  return {
    student: student as unknown as StudentWithUser,
    upcomingLessons: (upcoming ?? []) as unknown as LessonWithRelations[],
    recentLessons: (recent ?? []) as unknown as LessonWithRelations[],
    schoolName: (school as unknown as { name: string } | null)?.name ?? 'HelixDriving',
  }
}
