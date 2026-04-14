// Instructor portal service — server-side data fetching scoped to the logged-in instructor.

import { createClient } from '@/lib/supabase/server'
import type { InstructorWithUserAndAvailability, LessonWithRelations, Lesson } from '@/types'

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

// ── Earnings data ───────────────────────────────────────────

export interface EarningsLesson {
  id: string
  scheduled_at: string
  duration_minutes: number
  price_cents: number
  instructor_earning_cents: number
  sold_by: string
  status: string
  cancelled_by: string | null
  cancellation_fee_cents: number
  student_first_name: string
  student_last_name: string
}

export interface InstructorEarningsData {
  instructor: InstructorWithUserAndAvailability
  lessons: EarningsLesson[]
  cancelledLessons: EarningsLesson[]
}

export async function getInstructorEarningsData(
  periodStart: string,
  periodEnd: string,
): Promise<InstructorEarningsData | null> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: instructor } = await supabase
    .from('instructors')
    .select('*, user:users(*), availability(*)')
    .eq('user_id', user.id)
    .single()

  if (!instructor) return null

  const inst = instructor as unknown as InstructorWithUserAndAvailability

  // Completed lessons in period
  const { data: completed } = await supabase
    .from('lessons')
    .select('id, scheduled_at, duration_minutes, price_cents, instructor_earning_cents, sold_by, status, cancelled_by, cancellation_fee_cents, student:students(user:users!user_id(first_name, last_name))')
    .eq('instructor_id', inst.id)
    .eq('status', 'completed')
    .gte('scheduled_at', periodStart)
    .lt('scheduled_at', periodEnd)
    .order('scheduled_at', { ascending: false })

  // Cancelled lessons with fees in period
  const { data: cancelled } = await supabase
    .from('lessons')
    .select('id, scheduled_at, duration_minutes, price_cents, instructor_earning_cents, sold_by, status, cancelled_by, cancellation_fee_cents, student:students(user:users!user_id(first_name, last_name))')
    .eq('instructor_id', inst.id)
    .eq('status', 'cancelled')
    .eq('cancelled_by', 'instructor')
    .gt('cancellation_fee_cents', 0)
    .gte('scheduled_at', periodStart)
    .lt('scheduled_at', periodEnd)
    .order('scheduled_at', { ascending: false })

  function mapLesson(row: Record<string, unknown>): EarningsLesson {
    const student = row.student as Record<string, unknown> | null
    const studentUser = student?.user as Record<string, unknown> | null
    return {
      id: row.id as string,
      scheduled_at: row.scheduled_at as string,
      duration_minutes: row.duration_minutes as number,
      price_cents: row.price_cents as number,
      instructor_earning_cents: row.instructor_earning_cents as number,
      sold_by: row.sold_by as string,
      status: row.status as string,
      cancelled_by: row.cancelled_by as string | null,
      cancellation_fee_cents: row.cancellation_fee_cents as number,
      student_first_name: (studentUser?.first_name as string) ?? '',
      student_last_name: (studentUser?.last_name as string) ?? '',
    }
  }

  return {
    instructor: inst,
    lessons: (completed ?? []).map(r => mapLesson(r as unknown as Record<string, unknown>)),
    cancelledLessons: (cancelled ?? []).map(r => mapLesson(r as unknown as Record<string, unknown>)),
  }
}
