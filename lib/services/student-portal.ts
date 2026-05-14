// Student portal service — server-side data fetching scoped to the logged-in student.
// RLS ensures students can only see their own records.

import { createClient } from '@/lib/supabase/server'
import type {
  StudentWithUser,
  LessonWithRelations,
  StudentLedgerEntry,
  StudentPurchase,
  ClassroomSessionWithRelations,
} from '@/types'

export interface StudentPortalData {
  student: StudentWithUser
  upcomingLessons: LessonWithRelations[]
  recentLessons: LessonWithRelations[]
  schoolName: string
  balanceCents: number
  ledger: StudentLedgerEntry[]
  purchases: StudentPurchase[]
  classroomRequired: number
}

export interface StudentClassroomData {
  upcoming: ClassroomSessionWithRelations[]
  past: ClassroomSessionWithRelations[]
  totalRequired: number
  totalAttended: number
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

  // Ledger entries (charges, payments, adjustments) for the student
  const { data: ledger } = await supabase
    .from('student_ledger')
    .select('*')
    .eq('student_id', student.id)
    .order('created_at', { ascending: false })

  const balanceCents = (ledger ?? []).reduce(
    (sum, row: { amount_cents: number }) => sum + Number(row.amount_cents),
    0
  )

  // Purchases (one row per package sale)
  const { data: purchases } = await supabase
    .from('student_purchases')
    .select('*')
    .eq('student_id', student.id)
    .order('created_at', { ascending: false })

  const classroomRequired = (purchases ?? []).reduce(
    (sum, row: { classroom_required?: number | null }) =>
      sum + Number(row.classroom_required ?? 0),
    0
  )

  return {
    student: student as unknown as StudentWithUser,
    upcomingLessons: (upcoming ?? []) as unknown as LessonWithRelations[],
    recentLessons: (recent ?? []) as unknown as LessonWithRelations[],
    schoolName: (school as unknown as { name: string } | null)?.name ?? 'HelixDriving',
    balanceCents,
    ledger: (ledger ?? []) as unknown as StudentLedgerEntry[],
    purchases: (purchases ?? []) as unknown as StudentPurchase[],
    classroomRequired,
  }
}

// Lightweight signal for layout/nav: does the student have any classroom obligation
// (purchased classroom hours) OR enrollment (admin manually added them)?
export async function studentHasClassroom(): Promise<boolean> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false

  const { data: student } = await supabase
    .from('students')
    .select('id')
    .eq('user_id', user.id)
    .single()
  if (!student) return false

  const studentId = (student as { id: string }).id

  const [enrolledRes, requiredRes] = await Promise.all([
    supabase
      .from('classroom_attendance')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', studentId),
    supabase
      .from('student_purchases')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', studentId)
      .gt('classroom_required', 0),
  ])

  return (enrolledRes.count ?? 0) > 0 || (requiredRes.count ?? 0) > 0
}

// Fetches classroom sessions the current student is enrolled in.
// RLS filters: students can only SELECT sessions where they have an attendance row,
// and only their own row from classroom_attendance.
export async function getStudentClassroomData(): Promise<StudentClassroomData | null> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: student } = await supabase
    .from('students')
    .select('id, classroom_sessions_attended')
    .eq('user_id', user.id)
    .single()
  if (!student) return null

  const { data: purchases } = await supabase
    .from('student_purchases')
    .select('classroom_required')
    .eq('student_id', (student as { id: string }).id)

  const totalRequired = (purchases ?? []).reduce(
    (sum, row: { classroom_required?: number | null }) =>
      sum + Number(row.classroom_required ?? 0),
    0
  )

  const sessionSelect = `
    *,
    instructor:instructors(*, user:users(*)),
    attendance:classroom_attendance(*, student:students(*, user:users!user_id(*)))
  `

  const { data: sessions } = await supabase
    .from('classroom_sessions')
    .select(sessionSelect)
    .order('scheduled_at', { ascending: true })

  const all = (sessions ?? []) as unknown as ClassroomSessionWithRelations[]
  const now = new Date()
  const upcoming = all.filter(
    s => new Date(s.scheduled_at) >= now && s.status === 'scheduled'
  )
  const past = all
    .filter(s => new Date(s.scheduled_at) < now || s.status !== 'scheduled')
    .sort(
      (a, b) =>
        new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()
    )

  return {
    upcoming,
    past,
    totalRequired,
    totalAttended:
      (student as { classroom_sessions_attended: number | null })
        .classroom_sessions_attended ?? 0,
  }
}
