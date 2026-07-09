// State compliance reporting service (migration 044).
// Builds the Illinois Secretary of State student roster export and logs each
// generation to state_report_submissions for the record-retention audit trail
// described in MIGRATION_PLAN.md. The roster reads from existing student/user
// columns — no data is duplicated.

import { createClient } from '@/lib/supabase/server'
import { toCSV, type CSVColumn } from '@/lib/csv'

interface Ctx {
  userId: string
  schoolId: string
  role: string
}

async function requireContext(): Promise<Ctx> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('users')
    .select('role, school_id')
    .eq('id', user.id)
    .single<{ role: string; school_id: string }>()

  if (!profile) throw new Error('Profile not found')
  return { userId: user.id, schoolId: profile.school_id, role: profile.role }
}

interface RosterRow {
  last_name: string
  first_name: string
  date_of_birth: string | null
  permit_number: string
  permit_issued_date: string | null
  permit_expiration_date: string | null
  enrollment_date: string
  status: string
  total_lessons_completed: number
  classroom_sessions_attended: number
  observation_minutes_completed: number
  road_test_status: string
  road_test_date: string | null
}

const ROSTER_COLUMNS: CSVColumn<RosterRow>[] = [
  { header: 'Last Name', value: r => r.last_name },
  { header: 'First Name', value: r => r.first_name },
  { header: 'Date of Birth', value: r => r.date_of_birth },
  { header: 'Permit Number', value: r => r.permit_number },
  { header: 'Permit Issued', value: r => r.permit_issued_date },
  { header: 'Permit Expiration', value: r => r.permit_expiration_date },
  { header: 'Enrollment Date', value: r => r.enrollment_date },
  { header: 'Status', value: r => r.status },
  { header: 'BTW Lessons Completed', value: r => r.total_lessons_completed },
  { header: 'Classroom Sessions Attended', value: r => r.classroom_sessions_attended },
  { header: 'Observation Minutes', value: r => r.observation_minutes_completed },
  { header: 'Road Test Status', value: r => r.road_test_status },
  { header: 'Road Test Date', value: r => r.road_test_date },
]

export interface IlSosRosterResult {
  csv: string
  studentCount: number
}

// Builds the roster CSV and records the submission. Returns the CSV text so the
// API route can stream it as a file download.
export async function buildIlSosRoster(): Promise<IlSosRosterResult> {
  const ctx = await requireContext()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('students')
    .select(`
      enrollment_date, status, permit_number, permit_issued_date, permit_expiration_date,
      total_lessons_completed, classroom_sessions_attended, observation_minutes_completed,
      road_test_status, road_test_date,
      user:users!user_id(first_name, last_name, date_of_birth)
    `)
    .order('enrollment_date', { ascending: true })

  if (error) throw new Error(error.message)

  const source = (data ?? []) as unknown as Array<{
    enrollment_date: string
    status: string
    permit_number: string
    permit_issued_date: string | null
    permit_expiration_date: string | null
    total_lessons_completed: number
    classroom_sessions_attended: number
    observation_minutes_completed: number
    road_test_status: string
    road_test_date: string | null
    user: { first_name: string; last_name: string; date_of_birth: string | null } | null
  }>

  const rows: RosterRow[] = source.map(
    s => ({
      last_name: s.user?.last_name ?? '',
      first_name: s.user?.first_name ?? '',
      date_of_birth: s.user?.date_of_birth ?? null,
      permit_number: s.permit_number ?? '',
      permit_issued_date: s.permit_issued_date,
      permit_expiration_date: s.permit_expiration_date,
      enrollment_date: s.enrollment_date,
      status: s.status,
      total_lessons_completed: s.total_lessons_completed,
      classroom_sessions_attended: s.classroom_sessions_attended,
      observation_minutes_completed: s.observation_minutes_completed,
      road_test_status: s.road_test_status ?? '',
      road_test_date: s.road_test_date,
    }),
  )

  const csv = toCSV(rows, ROSTER_COLUMNS)

  await supabase.from('state_report_submissions').insert({
    school_id: ctx.schoolId,
    report_type: 'il_sos_roster',
    student_count: rows.length,
    generated_by: ctx.userId,
  })

  return { csv, studentCount: rows.length }
}

// ── Attendance sheet for one classroom session ─────────────────
interface AttendanceRow {
  last_name: string
  first_name: string
  status: string
  marked_at: string | null
}

const ATTENDANCE_COLUMNS: CSVColumn<AttendanceRow>[] = [
  { header: 'Last Name', value: r => r.last_name },
  { header: 'First Name', value: r => r.first_name },
  { header: 'Attendance', value: r => r.status },
  { header: 'Marked At', value: r => r.marked_at },
]

export async function buildAttendanceSheet(sessionId: string): Promise<IlSosRosterResult> {
  const ctx = await requireContext()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('classroom_attendance')
    .select('status, marked_at, student:students(user:users!user_id(first_name, last_name))')
    .eq('session_id', sessionId)

  if (error) throw new Error(error.message)

  const source = (data ?? []) as unknown as Array<{
    status: string
    marked_at: string | null
    student: { user: { first_name: string; last_name: string } | null } | null
  }>

  const rows: AttendanceRow[] = source.map(a => ({
    last_name: a.student?.user?.last_name ?? '',
    first_name: a.student?.user?.first_name ?? '',
    status: a.status,
    marked_at: a.marked_at,
  }))
  rows.sort((x, y) => x.last_name.localeCompare(y.last_name))

  await supabase.from('state_report_submissions').insert({
    school_id: ctx.schoolId,
    report_type: 'attendance_sheet',
    student_count: rows.length,
    generated_by: ctx.userId,
  })

  return { csv: toCSV(rows, ATTENDANCE_COLUMNS), studentCount: rows.length }
}

// ── Staff time-off report over a date range ────────────────────
interface TimeOffRow {
  last_name: string
  first_name: string
  date: string
  status: string
  reason: string | null
}

const TIME_OFF_COLUMNS: CSVColumn<TimeOffRow>[] = [
  { header: 'Last Name', value: r => r.last_name },
  { header: 'First Name', value: r => r.first_name },
  { header: 'Date', value: r => r.date },
  { header: 'Status', value: r => r.status },
  { header: 'Reason', value: r => r.reason },
]

export async function buildStaffTimeOffReport(
  periodStart: string,
  periodEnd: string,
): Promise<IlSosRosterResult> {
  const ctx = await requireContext()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('instructor_days_off')
    .select('date, status, reason, instructor:instructors(user:users!user_id(first_name, last_name))')
    .gte('date', periodStart)
    .lte('date', periodEnd)
    .order('date', { ascending: true })

  if (error) throw new Error(error.message)

  const source = (data ?? []) as unknown as Array<{
    date: string
    status: string
    reason: string | null
    instructor: { user: { first_name: string; last_name: string } | null } | null
  }>

  const rows: TimeOffRow[] = source.map(r => ({
    last_name: r.instructor?.user?.last_name ?? '',
    first_name: r.instructor?.user?.first_name ?? '',
    date: r.date,
    status: r.status,
    reason: r.reason,
  }))

  await supabase.from('state_report_submissions').insert({
    school_id: ctx.schoolId,
    report_type: 'staff_time_off',
    period_start: periodStart,
    period_end: periodEnd,
    student_count: rows.length,
    generated_by: ctx.userId,
  })

  return { csv: toCSV(rows, TIME_OFF_COLUMNS), studentCount: rows.length }
}
