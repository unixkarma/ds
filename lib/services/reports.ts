// Reports service — server-side data fetching for the reports page.
// Fetches all data needed across all 4 report tabs in a single call.
// Client-side filtering is applied after load.

import { createClient } from '@/lib/supabase/server'
import type { LessonWithRelations, PaymentWithRelations, StudentWithUser, InstructorWithUser } from '@/types'

export interface ReportsData {
  lessons: LessonWithRelations[]
  payments: PaymentWithRelations[]
  students: StudentWithUser[]
  instructors: InstructorWithUser[]
}

export async function getReportsData(): Promise<ReportsData> {
  const supabase = await createClient()

  const { data: lessons, error: lessonsError } = await supabase
    .from('lessons')
    .select(`
      *,
      student:students(*, user:users!user_id(*)),
      instructor:instructors(*, user:users(*)),
      vehicle:vehicles(*)
    `)
    .order('scheduled_at', { ascending: false })

  if (lessonsError) throw new Error(lessonsError.message)

  const { data: payments, error: paymentsError } = await supabase
    .from('payments')
    .select('*, student:students(*, user:users!user_id(*)), package:packages(*)')
    .order('created_at', { ascending: false })

  if (paymentsError) throw new Error(paymentsError.message)

  const { data: students, error: studentsError } = await supabase
    .from('students')
    .select('*, user:users!user_id(*)')
    .order('created_at', { ascending: false })

  if (studentsError) throw new Error(studentsError.message)

  const { data: instructors, error: instructorsError } = await supabase
    .from('instructors')
    .select('*, user:users(*)')
    .order('is_active', { ascending: false })

  if (instructorsError) throw new Error(instructorsError.message)

  return {
    lessons: (lessons ?? []) as unknown as LessonWithRelations[],
    payments: (payments ?? []) as unknown as PaymentWithRelations[],
    students: (students ?? []) as unknown as StudentWithUser[],
    instructors: (instructors ?? []) as unknown as InstructorWithUser[],
  }
}
