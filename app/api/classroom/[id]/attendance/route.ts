// POST /api/classroom/[id]/attendance — bulk-mark attendance (admin OR the assigned instructor)
//
// Body: { entries: [{ student_id, status }] }
// Statuses that count as "attended" are 'present' and 'late'. The route uses a
// no-drift delta: it diffs old vs new attended-bool per student and applies the
// delta to students.classroom_sessions_attended so repeated marks never drift.

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ATTENDED = new Set(['present', 'late'])

const attendanceSchema = z.object({
  entries: z.array(z.object({
    student_id: z.string().uuid(),
    status: z.enum(['enrolled', 'present', 'absent', 'late', 'excused']),
  })).min(1),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('role, school_id')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.role !== 'admin' && profile.role !== 'instructor')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const adminClient = createAdminClient()

  const { data: session } = await adminClient
    .from('classroom_sessions')
    .select('id, school_id, instructor_id')
    .eq('id', sessionId)
    .eq('school_id', profile.school_id)
    .single()
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  // If instructor, verify they own this session.
  if (profile.role === 'instructor') {
    const { data: inst } = await supabase
      .from('instructors')
      .select('id')
      .eq('user_id', user.id)
      .single()
    if (!inst || session.instructor_id !== inst.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const body = await request.json()
  const parsed = attendanceSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const studentIds = parsed.data.entries.map((e) => e.student_id)
  const { data: existing } = await adminClient
    .from('classroom_attendance')
    .select('student_id, status')
    .eq('session_id', sessionId)
    .in('student_id', studentIds)

  const existingByStudent = new Map<string, string>(
    (existing ?? []).map((r) => [r.student_id as string, r.status as string])
  )

  const nowIso = new Date().toISOString()
  // Aggregate deltas per student in case the same student appears twice
  const deltaByStudent = new Map<string, number>()

  for (const entry of parsed.data.entries) {
    const old = existingByStudent.get(entry.student_id) ?? null
    const oldAttended = old ? ATTENDED.has(old) : false
    const newAttended = ATTENDED.has(entry.status)

    if (old !== null) {
      const { error } = await adminClient
        .from('classroom_attendance')
        .update({ status: entry.status, marked_at: nowIso, marked_by: user.id })
        .eq('session_id', sessionId)
        .eq('student_id', entry.student_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const { error } = await adminClient.from('classroom_attendance').insert({
        session_id: sessionId,
        student_id: entry.student_id,
        school_id: session.school_id,
        status: entry.status,
        marked_at: nowIso,
        marked_by: user.id,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const delta = (newAttended ? 1 : 0) - (oldAttended ? 1 : 0)
    if (delta !== 0) {
      deltaByStudent.set(entry.student_id, (deltaByStudent.get(entry.student_id) ?? 0) + delta)
    }
    // Keep existingByStudent in sync if the same student appears again in the same batch
    existingByStudent.set(entry.student_id, entry.status)
  }

  for (const [studentId, delta] of deltaByStudent.entries()) {
    if (delta === 0) continue
    const { data: student } = await adminClient
      .from('students')
      .select('classroom_sessions_attended')
      .eq('id', studentId)
      .single()
    if (!student) continue
    const next = Math.max(0, (student.classroom_sessions_attended ?? 0) + delta)
    await adminClient
      .from('students')
      .update({ classroom_sessions_attended: next })
      .eq('id', studentId)
  }

  return NextResponse.json({ updated: parsed.data.entries.length })
}
