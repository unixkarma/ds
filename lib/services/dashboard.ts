// Dashboard statistics service
// All queries are scoped to the current user's school via RLS + explicit school_id filter.

import { createClient } from '@/lib/supabase/server'
import type { DashboardStats, LessonWithRelations } from '@/types'

export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase
    .from('users')
    .select('school_id')
    .eq('id', user.id)
    .single()

  if (!profile?.school_id) throw new Error('School not found')

  const schoolId = profile.school_id

  // Build date boundaries
  const now = new Date()

  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)

  const startOfTomorrow = new Date(startOfToday)
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1)

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  // Run all 4 queries in parallel for performance
  const [studentsResult, lessonsTodayResult, paymentsResult, upcomingResult] =
    await Promise.all([
      // 1. Total active students
      supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', schoolId)
        .eq('status', 'active'),

      // 2. Lessons scheduled for today
      supabase
        .from('lessons')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', schoolId)
        .gte('scheduled_at', startOfToday.toISOString())
        .lt('scheduled_at', startOfTomorrow.toISOString())
        .eq('status', 'scheduled'),

      // 3. Completed payments this month (for revenue total)
      supabase
        .from('payments')
        .select('amount_cents')
        .eq('school_id', schoolId)
        .eq('status', 'completed')
        .gte('created_at', startOfMonth.toISOString()),

      // 4. Next 5 upcoming lessons with student + instructor names
      supabase
        .from('lessons')
        .select(
          `
          *,
          student:students(
            *,
            user:users!user_id(*)
          ),
          instructor:instructors(
            *,
            user:users(*)
          ),
          vehicle:vehicles(*)
        `
        )
        .eq('school_id', schoolId)
        .eq('status', 'scheduled')
        .gte('scheduled_at', now.toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(5),
    ])

  const revenueThisMonthCents =
    paymentsResult.data?.reduce((sum, p) => sum + p.amount_cents, 0) ?? 0

  return {
    totalActiveStudents: studentsResult.count ?? 0,
    lessonsTodayCount: lessonsTodayResult.count ?? 0,
    revenueThisMonthCents,
    upcomingLessons: (upcomingResult.data ?? []) as unknown as LessonWithRelations[],
  }
}
