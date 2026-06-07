// GET  /api/instructor-days-off?instructorId=...
//   Lists days off for the given instructor in a window (default: today → +14 days).
// POST /api/instructor-days-off
//   Marks a date as off for an instructor. Triggers regeneration of openings.
//   If a `booked` opening exists on that date, the request is rejected with 409 —
//   the user must cancel the lesson first.

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { regenerateOpenings } from '@/lib/services/openings-generator'

const createSchema = z.object({
  instructorId: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format must be YYYY-MM-DD'),
  reason: z.string().max(120).optional(),
})

// ── GET ───────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('role, school_id')
    .eq('id', user.id)
    .single()
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const queryInstructorId = searchParams.get('instructorId')

  // Default: today → +60 days (so the Days Off tab can show a wider horizon than the 14-day cron)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const horizon = new Date(today)
  horizon.setDate(today.getDate() + 60)

  let query = supabase
    .from('instructor_days_off')
    .select('*')
    .eq('school_id', profile.school_id)
    .gte('date', today.toISOString().slice(0, 10))
    .lt('date', horizon.toISOString().slice(0, 10))
    .order('date', { ascending: true })

  if (queryInstructorId) {
    query = query.eq('instructor_id', queryInstructorId)
  } else if (profile.role === 'instructor') {
    // Instructor: scope to self
    const { data: inst } = await supabase
      .from('instructors')
      .select('id')
      .eq('user_id', user.id)
      .single()
    if (inst) query = query.eq('instructor_id', inst.id)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ daysOff: data ?? [] })
}

// ── POST ──────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
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

  const body = await request.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { date, reason } = parsed.data

  // Resolve target instructor
  let instructorId: string
  if (profile.role === 'instructor') {
    const { data: inst } = await supabase
      .from('instructors')
      .select('id')
      .eq('user_id', user.id)
      .single()
    if (!inst) return NextResponse.json({ error: 'Instructor record not found' }, { status: 404 })
    instructorId = inst.id
  } else {
    if (!parsed.data.instructorId) {
      return NextResponse.json(
        { error: 'instructorId is required when admin marks a day off.' },
        { status: 400 }
      )
    }
    const { data: inst } = await supabase
      .from('instructors')
      .select('id')
      .eq('id', parsed.data.instructorId)
      .eq('school_id', profile.school_id)
      .single()
    if (!inst) return NextResponse.json({ error: 'Instructor not found' }, { status: 404 })
    instructorId = inst.id
  }

  const adminClient = createAdminClient()

  // Admin-marked days off apply immediately; instructor requests await approval.
  const isAdmin = profile.role === 'admin'
  const status = isAdmin ? 'approved' : 'pending'

  // Only block on booked lessons when the day off takes effect immediately
  // (admin direct). A pending request is allowed even if lessons exist — the
  // admin resolves any conflict when approving.
  if (status === 'approved') {
    const dayStart = new Date(date + 'T00:00:00').toISOString()
    const nextDay = new Date(date + 'T00:00:00')
    nextDay.setDate(nextDay.getDate() + 1)

    const { data: bookedOnDay } = await adminClient
      .from('openings')
      .select('id')
      .eq('instructor_id', instructorId)
      .eq('status', 'booked')
      .gte('scheduled_at', dayStart)
      .lt('scheduled_at', nextDay.toISOString())

    if ((bookedOnDay ?? []).length > 0) {
      return NextResponse.json(
        {
          error: `There are ${bookedOnDay!.length} booked lesson(s) on ${date}. Cancel them first before marking the day off.`,
        },
        { status: 409 }
      )
    }
  }

  // Insert
  const { data: dayOff, error } = await adminClient
    .from('instructor_days_off')
    .insert({
      school_id: profile.school_id,
      instructor_id: instructorId,
      date,
      reason: reason ?? null,
      status,
      reviewed_by: isAdmin ? user.id : null,
      reviewed_at: isAdmin ? new Date().toISOString() : null,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: `${date} is already marked as off (or has a pending request).` },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Only an approved day off changes the schedule.
  if (status === 'approved') {
    await regenerateOpenings({ instructorId, schoolId: profile.school_id })
  }

  return NextResponse.json({ dayOff }, { status: 201 })
}
