// POST /api/classroom/[id]/enrollments — enroll a list of students (admin)
// DELETE /api/classroom/[id]/enrollments?student_id=... — unenroll a student (admin)

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ATTENDED = new Set(['present', 'late'])

const enrollSchema = z.object({
  student_ids: z.array(z.string().uuid()).min(1),
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

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = enrollSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const adminClient = createAdminClient()

  const { data: session } = await adminClient
    .from('classroom_sessions')
    .select('id, school_id, capacity')
    .eq('id', sessionId)
    .eq('school_id', profile.school_id)
    .single()
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const { data: existing } = await adminClient
    .from('classroom_attendance')
    .select('student_id')
    .eq('session_id', sessionId)

  const existingIds = new Set((existing ?? []).map((r) => r.student_id as string))
  const newIds = parsed.data.student_ids.filter((sid) => !existingIds.has(sid))

  if (newIds.length === 0) {
    return NextResponse.json({ inserted: 0 })
  }

  if (existingIds.size + newIds.length > session.capacity) {
    return NextResponse.json(
      { error: `Capacity exceeded: session has ${session.capacity} seats.` },
      { status: 400 }
    )
  }

  const rows = newIds.map((studentId) => ({
    session_id: sessionId,
    student_id: studentId,
    school_id: session.school_id,
    status: 'enrolled',
  }))

  const { error } = await adminClient.from('classroom_attendance').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ inserted: newIds.length })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params
  const studentId = request.nextUrl.searchParams.get('student_id')
  if (!studentId) {
    return NextResponse.json({ error: 'student_id is required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('role, school_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const adminClient = createAdminClient()

  const { data: row } = await adminClient
    .from('classroom_attendance')
    .select('status')
    .eq('session_id', sessionId)
    .eq('student_id', studentId)
    .maybeSingle()

  const { error } = await adminClient
    .from('classroom_attendance')
    .delete()
    .eq('session_id', sessionId)
    .eq('student_id', studentId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If the student had been counted as attended, decrement the counter.
  if (row && ATTENDED.has(row.status)) {
    const { data: student } = await adminClient
      .from('students')
      .select('classroom_sessions_attended')
      .eq('id', studentId)
      .single()

    if (student) {
      await adminClient
        .from('students')
        .update({
          classroom_sessions_attended: Math.max(0, (student.classroom_sessions_attended ?? 0) - 1),
        })
        .eq('id', studentId)
    }
  }

  return NextResponse.json({ ok: true })
}
