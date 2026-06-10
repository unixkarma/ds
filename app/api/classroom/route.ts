// GET /api/classroom — list classroom sessions in a date range
// POST /api/classroom — create a classroom session (admin only)

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { listClassroomSessions } from '@/lib/services/classroom'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const start = searchParams.get('start')
  const end = searchParams.get('end')

  if (!start || !end) {
    return NextResponse.json({ error: 'start and end are required' }, { status: 400 })
  }

  try {
    const sessions = await listClassroomSessions({
      fromDate: new Date(start),
      toDate: new Date(end),
    })
    return NextResponse.json({ sessions })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load sessions'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

const createSchema = z.object({
  instructor_id: z.string().uuid().nullable().optional(),
  scheduled_at: z.string().datetime(),
  duration_minutes: z.number().int().min(15).max(480),
  capacity: z.number().int().positive(),
  topic: z.string().default(''),
  location: z.string().default(''),
  price_cents: z.number().int().min(0).default(0),
  instructor_earning_cents: z.number().int().min(0).default(0),
  notes: z.string().default(''),
  student_ids: z.array(z.string().uuid()).default([]),
})

export async function POST(request: NextRequest) {
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
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  if (parsed.data.student_ids.length > parsed.data.capacity) {
    return NextResponse.json(
      { error: `Cannot enroll ${parsed.data.student_ids.length} students into a session with capacity ${parsed.data.capacity}.` },
      { status: 400 }
    )
  }

  const adminClient = createAdminClient()

  const { data: session, error } = await adminClient
    .from('classroom_sessions')
    .insert({
      school_id: profile.school_id,
      instructor_id: parsed.data.instructor_id ?? null,
      scheduled_at: parsed.data.scheduled_at,
      duration_minutes: parsed.data.duration_minutes,
      capacity: parsed.data.capacity,
      topic: parsed.data.topic,
      location: parsed.data.location,
      price_cents: parsed.data.price_cents,
      instructor_earning_cents: parsed.data.instructor_earning_cents,
      notes: parsed.data.notes,
    })
    .select('id')
    .single()

  if (error || !session) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create session' }, { status: 500 })
  }

  if (parsed.data.student_ids.length > 0) {
    const rows = parsed.data.student_ids.map((studentId) => ({
      session_id: session.id,
      student_id: studentId,
      school_id: profile.school_id,
      status: 'enrolled',
    }))
    const { error: enrollErr } = await adminClient.from('classroom_attendance').insert(rows)
    if (enrollErr) {
      return NextResponse.json({ error: enrollErr.message }, { status: 500 })
    }
  }

  return NextResponse.json({ session }, { status: 201 })
}
