// Reports service — server-side data fetching for the reports page.
// Fetches all data needed across all 4 report tabs in a single call.
// Client-side filtering is applied after load.

import { createClient } from '@/lib/supabase/server'
import { getBalancesForStudents, getLedgerForSchool } from '@/lib/services/student-ledger'
import {
  listAssignmentsForSchool,
  listDeductionsForSchool,
  listReimbursementsForSchool,
} from '@/lib/services/instructor-extras'
import type {
  LessonWithRelations,
  PaymentWithRelations,
  StudentWithUser,
  InstructorWithUser,
  ClassroomSessionWithRelations,
  StudentPurchaseWithRelations,
  StudentLedgerEntryWithStudent,
  InstructorAssignmentWithInstructor,
  InstructorDeductionWithInstructor,
  InstructorReimbursementWithInstructor,
} from '@/types'

export interface ReportsData {
  lessons: LessonWithRelations[]
  payments: PaymentWithRelations[]
  purchases: StudentPurchaseWithRelations[]
  students: StudentWithUser[]
  instructors: InstructorWithUser[]
  studentBalances: Record<string, number>
  ledger: StudentLedgerEntryWithStudent[]
  classroomSessions: ClassroomSessionWithRelations[]
  assignments: InstructorAssignmentWithInstructor[]
  deductions: InstructorDeductionWithInstructor[]
  reimbursements: InstructorReimbursementWithInstructor[]
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

  const { data: purchases, error: purchasesError } = await supabase
    .from('student_purchases')
    .select(`
      *,
      student:students(*, user:users!user_id(*)),
      sold_by_instructor:instructors!sold_by_instructor_id(*, user:users(*))
    `)
    .order('created_at', { ascending: false })

  if (purchasesError) throw new Error(purchasesError.message)

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

  const { data: classroomSessions, error: classroomErr } = await supabase
    .from('classroom_sessions')
    .select(`
      *,
      instructor:instructors(*, user:users(*)),
      attendance:classroom_attendance(
        *,
        student:students(*, user:users!user_id(*))
      )
    `)
    .order('scheduled_at', { ascending: false })

  if (classroomErr) throw new Error(classroomErr.message)

  const studentList = (students ?? []) as unknown as StudentWithUser[]
  const [balances, ledger, assignments, deductions, reimbursements] = await Promise.all([
    getBalancesForStudents(studentList.map((s) => s.id)),
    getLedgerForSchool(),
    listAssignmentsForSchool(),
    listDeductionsForSchool(),
    listReimbursementsForSchool(),
  ])

  return {
    lessons: (lessons ?? []) as unknown as LessonWithRelations[],
    payments: (payments ?? []) as unknown as PaymentWithRelations[],
    purchases: (purchases ?? []) as unknown as StudentPurchaseWithRelations[],
    students: studentList,
    instructors: (instructors ?? []) as unknown as InstructorWithUser[],
    studentBalances: Object.fromEntries(balances),
    ledger,
    classroomSessions: (classroomSessions ?? []) as unknown as ClassroomSessionWithRelations[],
    assignments,
    deductions,
    reimbursements,
  }
}

// ── Classroom report ─────────────────────────────────────────

export interface ClassroomAttendanceReport {
  sessions: ClassroomSessionWithRelations[]
  totalSessions: number
  totalEnrollments: number
  totalAttended: number   // present + late
  attendanceRate: number  // 0..1; 0 when totalEnrollments is 0
}

export async function getClassroomAttendanceReport(
  fromDate?: Date,
  toDate?: Date
): Promise<ClassroomAttendanceReport> {
  const supabase = await createClient()

  let query = supabase
    .from('classroom_sessions')
    .select(`
      *,
      instructor:instructors(*, user:users(*)),
      attendance:classroom_attendance(
        *,
        student:students(*, user:users!user_id(*))
      )
    `)
    .order('scheduled_at', { ascending: false })

  if (fromDate) query = query.gte('scheduled_at', fromDate.toISOString())
  if (toDate) query = query.lt('scheduled_at', toDate.toISOString())

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const sessions = (data ?? []) as unknown as ClassroomSessionWithRelations[]

  let totalEnrollments = 0
  let totalAttended = 0
  for (const session of sessions) {
    for (const row of session.attendance ?? []) {
      totalEnrollments += 1
      if (row.status === 'present' || row.status === 'late') totalAttended += 1
    }
  }

  return {
    sessions,
    totalSessions: sessions.length,
    totalEnrollments,
    totalAttended,
    attendanceRate: totalEnrollments === 0 ? 0 : totalAttended / totalEnrollments,
  }
}
