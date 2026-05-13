// Classroom service — server-side data fetching and writes for group (in-room)
// lessons. Classroom is a parallel hierarchy to BTW: it owns its own sessions
// and per-student attendance roster. Sessions carry price + instructor_earning
// so they flow into the existing payroll/reports surface.
//
// All read queries are automatically scoped to the current user's school via RLS.
// Writes go through the same RLS-aware client; the routes that call them must
// have already authorized the actor (admin for create/enroll, admin/instructor
// for markAttendance).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type {
  ClassroomSession,
  ClassroomSessionStatus,
  ClassroomSessionWithRelations,
  ClassroomAttendanceStatus,
} from '@/types'

// Statuses that count as "the student showed up" for the counter on students.
const ATTENDED_STATUSES: readonly ClassroomAttendanceStatus[] = ['present', 'late']

function isAttended(status: ClassroomAttendanceStatus): boolean {
  return ATTENDED_STATUSES.includes(status)
}

const SESSION_SELECT = `
  *,
  instructor:instructors(*, user:users(*)),
  attendance:classroom_attendance(
    *,
    student:students(*, user:users!user_id(*))
  )
`

// ── Reads ────────────────────────────────────────────────────

export interface ListClassroomSessionsFilters {
  instructorId?: string
  statuses?: ClassroomSessionStatus[]
  fromDate?: Date
  toDate?: Date
}

export async function listClassroomSessions(
  filters: ListClassroomSessionsFilters = {}
): Promise<ClassroomSessionWithRelations[]> {
  const supabase = await createClient()

  let query = supabase
    .from('classroom_sessions')
    .select(SESSION_SELECT)
    .order('scheduled_at', { ascending: false })

  if (filters.instructorId) query = query.eq('instructor_id', filters.instructorId)
  if (filters.statuses && filters.statuses.length > 0) query = query.in('status', filters.statuses)
  if (filters.fromDate) query = query.gte('scheduled_at', filters.fromDate.toISOString())
  if (filters.toDate) query = query.lt('scheduled_at', filters.toDate.toISOString())

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ClassroomSessionWithRelations[]
}

export async function getClassroomSessionById(
  id: string
): Promise<ClassroomSessionWithRelations | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('classroom_sessions')
    .select(SESSION_SELECT)
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(error.message)
  }
  return data as unknown as ClassroomSessionWithRelations
}

export async function getInstructorClassroomSessions(
  instructorId: string
): Promise<ClassroomSessionWithRelations[]> {
  return listClassroomSessions({ instructorId })
}

// Returns the count of upcoming sessions an instructor has assigned. Used to
// decide whether to show the Classroom tab in the instructor header.
export async function countInstructorClassroomSessions(
  instructorId: string
): Promise<number> {
  const supabase = await createClient()
  const { count, error } = await supabase
    .from('classroom_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('instructor_id', instructorId)

  if (error) throw new Error(error.message)
  return count ?? 0
}

// ── Writes ───────────────────────────────────────────────────

export interface CreateClassroomSessionInput {
  schoolId: string
  instructorId: string | null
  scheduledAt: string            // ISO timestamp
  durationMinutes: number
  capacity: number
  topic: string
  location: string
  priceCents: number
  instructorEarningCents: number
  notes?: string
}

export async function createClassroomSession(
  input: CreateClassroomSessionInput
): Promise<ClassroomSession> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('classroom_sessions')
    .insert({
      school_id: input.schoolId,
      instructor_id: input.instructorId,
      scheduled_at: input.scheduledAt,
      duration_minutes: input.durationMinutes,
      capacity: input.capacity,
      topic: input.topic,
      location: input.location,
      price_cents: input.priceCents,
      instructor_earning_cents: input.instructorEarningCents,
      notes: input.notes ?? '',
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to create classroom session')
  }
  return data as ClassroomSession
}

export interface UpdateClassroomSessionPatch {
  instructorId?: string | null
  scheduledAt?: string
  durationMinutes?: number
  capacity?: number
  topic?: string
  location?: string
  priceCents?: number
  instructorEarningCents?: number
  notes?: string
  status?: ClassroomSessionStatus
}

export async function updateClassroomSession(
  id: string,
  patch: UpdateClassroomSessionPatch
): Promise<ClassroomSession> {
  const supabase = await createClient()

  const update: Record<string, unknown> = {}
  if (patch.instructorId !== undefined) update.instructor_id = patch.instructorId
  if (patch.scheduledAt !== undefined) update.scheduled_at = patch.scheduledAt
  if (patch.durationMinutes !== undefined) update.duration_minutes = patch.durationMinutes
  if (patch.capacity !== undefined) update.capacity = patch.capacity
  if (patch.topic !== undefined) update.topic = patch.topic
  if (patch.location !== undefined) update.location = patch.location
  if (patch.priceCents !== undefined) update.price_cents = patch.priceCents
  if (patch.instructorEarningCents !== undefined) {
    update.instructor_earning_cents = patch.instructorEarningCents
  }
  if (patch.notes !== undefined) update.notes = patch.notes
  if (patch.status !== undefined) update.status = patch.status

  const { data, error } = await supabase
    .from('classroom_sessions')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to update classroom session')
  }
  return data as ClassroomSession
}

export async function cancelClassroomSession(id: string): Promise<ClassroomSession> {
  return updateClassroomSession(id, { status: 'cancelled' })
}

// Enrolls a set of students into the session. Capacity is enforced before
// inserting. Idempotent: existing enrollment rows are left untouched
// (UNIQUE(session_id, student_id) blocks duplicates).
export async function enrollStudents(
  sessionId: string,
  studentIds: string[]
): Promise<{ inserted: number }> {
  if (studentIds.length === 0) return { inserted: 0 }

  const supabase = await createClient()

  const { data: session, error: sessErr } = await supabase
    .from('classroom_sessions')
    .select('id, school_id, capacity')
    .eq('id', sessionId)
    .single()

  if (sessErr || !session) {
    throw new Error(sessErr?.message ?? 'Session not found')
  }

  const { data: existing, error: existingErr } = await supabase
    .from('classroom_attendance')
    .select('student_id')
    .eq('session_id', sessionId)

  if (existingErr) throw new Error(existingErr.message)

  const existingIds = new Set((existing ?? []).map((r) => r.student_id as string))
  const newIds = studentIds.filter((id) => !existingIds.has(id))

  if (newIds.length === 0) return { inserted: 0 }

  const totalAfter = existingIds.size + newIds.length
  if (totalAfter > session.capacity) {
    throw new Error(
      `Capacity exceeded: this session has ${session.capacity} seats and adding ${newIds.length} would total ${totalAfter}.`
    )
  }

  const rows = newIds.map((studentId) => ({
    session_id: sessionId,
    student_id: studentId,
    school_id: session.school_id,
    status: 'enrolled' as ClassroomAttendanceStatus,
  }))

  const { error: insertErr } = await supabase.from('classroom_attendance').insert(rows)
  if (insertErr) throw new Error(insertErr.message)

  return { inserted: newIds.length }
}

export async function unenrollStudent(
  sessionId: string,
  studentId: string
): Promise<void> {
  const supabase = await createClient()

  // If the student had previously been marked attended, we need to decrement
  // their counter so it doesn't drift after deletion.
  const { data: row } = await supabase
    .from('classroom_attendance')
    .select('status')
    .eq('session_id', sessionId)
    .eq('student_id', studentId)
    .maybeSingle()

  const { error } = await supabase
    .from('classroom_attendance')
    .delete()
    .eq('session_id', sessionId)
    .eq('student_id', studentId)

  if (error) throw new Error(error.message)

  if (row && isAttended(row.status as ClassroomAttendanceStatus)) {
    await applyCounterDelta(supabase, studentId, -1)
  }
}

// Idempotent per-student attendance write. For each entry, we compute the
// counter delta (newIsAttended - oldIsAttended) so re-marks never drift the
// students.classroom_sessions_attended counter.
export interface MarkAttendanceEntry {
  studentId: string
  status: ClassroomAttendanceStatus
}

export async function markAttendance(
  sessionId: string,
  entries: MarkAttendanceEntry[]
): Promise<{ updated: number }> {
  if (entries.length === 0) return { updated: 0 }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Confirm the session and pick up school_id for any new attendance rows.
  const { data: session, error: sessErr } = await supabase
    .from('classroom_sessions')
    .select('id, school_id')
    .eq('id', sessionId)
    .single()
  if (sessErr || !session) throw new Error(sessErr?.message ?? 'Session not found')

  // Pull existing attendance rows for the affected students in one query.
  const studentIds = entries.map((e) => e.studentId)
  const { data: existing, error: existingErr } = await supabase
    .from('classroom_attendance')
    .select('student_id, status')
    .eq('session_id', sessionId)
    .in('student_id', studentIds)
  if (existingErr) throw new Error(existingErr.message)

  const existingByStudent = new Map<string, ClassroomAttendanceStatus>(
    (existing ?? []).map((r) => [r.student_id as string, r.status as ClassroomAttendanceStatus])
  )

  const nowIso = new Date().toISOString()
  let updated = 0

  for (const entry of entries) {
    const old = existingByStudent.get(entry.studentId) ?? null
    const oldAttended = old ? isAttended(old) : false
    const newAttended = isAttended(entry.status)

    // Upsert the row.
    if (old) {
      const { error } = await supabase
        .from('classroom_attendance')
        .update({
          status: entry.status,
          marked_at: nowIso,
          marked_by: user.id,
        })
        .eq('session_id', sessionId)
        .eq('student_id', entry.studentId)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabase.from('classroom_attendance').insert({
        session_id: sessionId,
        student_id: entry.studentId,
        school_id: session.school_id,
        status: entry.status,
        marked_at: nowIso,
        marked_by: user.id,
      })
      if (error) throw new Error(error.message)
    }

    const delta = (newAttended ? 1 : 0) - (oldAttended ? 1 : 0)
    if (delta !== 0) {
      await applyCounterDelta(supabase, entry.studentId, delta)
    }
    updated += 1
  }

  return { updated }
}

// Internal: bumps students.classroom_sessions_attended by the given delta.
// Reads-then-writes (RLS-aware) instead of an atomic SQL UPDATE because the
// project doesn't expose a generic increment RPC.
async function applyCounterDelta(
  client: SupabaseClient,
  studentId: string,
  delta: number
): Promise<void> {
  if (delta === 0) return

  const { data, error } = await client
    .from('students')
    .select('classroom_sessions_attended')
    .eq('id', studentId)
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Student not found')

  const next = Math.max(0, (data.classroom_sessions_attended ?? 0) + delta)
  const { error: updateErr } = await client
    .from('students')
    .update({ classroom_sessions_attended: next })
    .eq('id', studentId)
  if (updateErr) throw new Error(updateErr.message)
}
