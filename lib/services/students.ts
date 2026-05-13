// Student service — server-side data fetching.
// All queries are automatically scoped to the current user's school via RLS.

import { createClient } from '@/lib/supabase/server'
import type {
  StudentWithUser,
  LessonWithRelations,
  StudentPurchase,
  PaymentWithRelations,
  StudentLedgerEntry,
  ClassroomAttendance,
  ClassroomSession,
} from '@/types'

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

// Per-student aggregated record used by the printable report at
// /dashboard/reports/student/[id]. Pulls the student's profile alongside every
// related artifact (BTW lessons, purchases, payments, ledger, classroom
// attendance) so the report renders from a single object.
export interface ClassroomAttendanceWithSession extends ClassroomAttendance {
  session: ClassroomSession
}

export interface StudentFullReport {
  student: StudentWithUser
  lessons: LessonWithRelations[]
  purchases: StudentPurchase[]
  payments: PaymentWithRelations[]
  ledger: StudentLedgerEntry[]
  classroomAttendance: ClassroomAttendanceWithSession[]
  balanceCents: number
}

export async function getStudentFullReport(
  id: string
): Promise<StudentFullReport | null> {
  const supabase = await createClient()

  const [
    studentResult,
    lessonsResult,
    purchasesResult,
    paymentsResult,
    ledgerResult,
    attendanceResult,
  ] = await Promise.all([
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
      .order('scheduled_at', { ascending: false }),

    supabase
      .from('student_purchases')
      .select('*')
      .eq('student_id', id)
      .order('created_at', { ascending: false }),

    supabase
      .from('payments')
      .select('*, package:packages(*)')
      .eq('student_id', id)
      .order('created_at', { ascending: false }),

    supabase
      .from('student_ledger')
      .select('*')
      .eq('student_id', id)
      .order('created_at', { ascending: false }),

    supabase
      .from('classroom_attendance')
      .select('*, session:classroom_sessions(*)')
      .eq('student_id', id)
      .order('created_at', { ascending: false }),
  ])

  if (studentResult.error) {
    if (studentResult.error.code === 'PGRST116') return null
    throw new Error(studentResult.error.message)
  }

  const student = studentResult.data as unknown as StudentWithUser
  const lessons = (lessonsResult.data ?? []) as unknown as LessonWithRelations[]
  const purchases = (purchasesResult.data ?? []) as StudentPurchase[]
  const payments = (paymentsResult.data ?? []) as unknown as PaymentWithRelations[]
  const ledger = (ledgerResult.data ?? []) as StudentLedgerEntry[]
  const classroomAttendance = (attendanceResult.data ?? []) as unknown as ClassroomAttendanceWithSession[]

  // Attach student onto each payment row so it matches PaymentWithRelations.
  for (const payment of payments) {
    if (!payment.student) {
      (payment as unknown as { student: StudentWithUser }).student = student
    }
  }

  const balanceCents = ledger.reduce((sum, row) => sum + Number(row.amount_cents), 0)

  return {
    student,
    lessons,
    purchases,
    payments,
    ledger,
    classroomAttendance,
    balanceCents,
  }
}
