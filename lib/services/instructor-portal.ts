// Instructor portal service — server-side data fetching scoped to the logged-in instructor.

import { createClient } from '@/lib/supabase/server'
import type { InstructorWithUserAndAvailability, LessonWithRelations } from '@/types'

export interface InstructorPortalData {
  instructor: InstructorWithUserAndAvailability
  todayLessons: LessonWithRelations[]
  upcomingLessons: LessonWithRelations[]
  completedCount: number
  schoolName: string
}

export async function getInstructorPortalData(): Promise<InstructorPortalData | null> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  // Fetch instructor record for the current user
  const { data: instructor, error: instructorError } = await supabase
    .from('instructors')
    .select('*, user:users(*), availability(*)')
    .eq('user_id', user.id)
    .single()

  if (instructorError || !instructor) return null

  // Fetch school name
  const { data: school } = await supabase
    .from('schools')
    .select('name')
    .eq('id', (instructor as unknown as InstructorWithUserAndAvailability).user.school_id)
    .single()

  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(todayStart)
  todayEnd.setDate(todayEnd.getDate() + 1)

  const lessonSelect = `
    *,
    student:students(*, user:users!user_id(*)),
    instructor:instructors(*, user:users(*)),
    vehicle:vehicles(*)
  `

  // Today's lessons
  const { data: today } = await supabase
    .from('lessons')
    .select(lessonSelect)
    .eq('instructor_id', (instructor as unknown as InstructorWithUserAndAvailability).id)
    .gte('scheduled_at', todayStart.toISOString())
    .lt('scheduled_at', todayEnd.toISOString())
    .in('status', ['scheduled', 'completed'])
    .order('scheduled_at', { ascending: true })

  // Upcoming scheduled lessons (after today)
  const { data: upcoming } = await supabase
    .from('lessons')
    .select(lessonSelect)
    .eq('instructor_id', (instructor as unknown as InstructorWithUserAndAvailability).id)
    .eq('status', 'scheduled')
    .gte('scheduled_at', todayEnd.toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(10)

  // Count of completed lessons
  const { count: completedCount } = await supabase
    .from('lessons')
    .select('id', { count: 'exact', head: true })
    .eq('instructor_id', (instructor as unknown as InstructorWithUserAndAvailability).id)
    .eq('status', 'completed')

  return {
    instructor: instructor as unknown as InstructorWithUserAndAvailability,
    todayLessons: (today ?? []) as unknown as LessonWithRelations[],
    upcomingLessons: (upcoming ?? []) as unknown as LessonWithRelations[],
    completedCount: completedCount ?? 0,
    schoolName: (school as unknown as { name: string } | null)?.name ?? 'HelixDriving',
  }
}
