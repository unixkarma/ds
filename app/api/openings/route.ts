// GET  /api/openings?start=ISO&end=ISO&instructorId=...&status=available,booked
//   Lists openings in a range. Visibility follows the RLS policy from migration 023.
// POST /api/openings
//   Admin-only manual creation (override). Used rarely; generation from templates is
//   the normal path — see /api/openings/generate.

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { OpeningStatus } from '@/types'

// ── GET ───────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const start = searchParams.get('start')
  const end = searchParams.get('end')
  const instructorId = searchParams.get('instructorId')
  const statusParam = searchParams.get('status') // comma-separated

  if (!start || !end) {
    return NextResponse.json({ error: 'start and end are required' }, { status: 400 })
  }

  let query = supabase
    .from('openings')
    .select(`
      *,
      instructor:instructors(*, user:users(*))
    `)
    .gte('scheduled_at', start)
    .lt('scheduled_at', end)
    .order('scheduled_at', { ascending: true })

  if (instructorId) query = query.eq('instructor_id', instructorId)

  if (statusParam) {
    const statuses = statusParam.split(',').filter(Boolean) as OpeningStatus[]
    if (statuses.length > 0) query = query.in('status', statuses)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ openings: data ?? [] })
}

// ── POST ──────────────────────────────────────────────────────
const createOpeningSchema = z.object({
  instructorId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(240).default(60),
  status: z.enum(['available', 'blocked']).default('available'),
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

  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Admin or the instructor themselves can create openings via this endpoint.
  // Instructor identity is verified below.
  if (profile.role !== 'admin' && profile.role !== 'instructor') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = createOpeningSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { instructorId, scheduledAt, durationMinutes, status } = parsed.data

  // Verify the instructor belongs to this school
  const { data: instructorRow } = await supabase
    .from('instructors')
    .select('id, user_id, school_id')
    .eq('id', instructorId)
    .eq('school_id', profile.school_id)
    .single()

  if (!instructorRow) {
    return NextResponse.json({ error: 'Instructor not found' }, { status: 404 })
  }

  // Instructors can only create openings for themselves
  if (profile.role === 'instructor' && instructorRow.user_id !== user.id) {
    return NextResponse.json(
      { error: 'Instructors can only create openings for themselves.' },
      { status: 403 }
    )
  }

  const adminClient = createAdminClient()
  const { data: opening, error } = await adminClient
    .from('openings')
    .insert({
      school_id: profile.school_id,
      instructor_id: instructorId,
      scheduled_at: scheduledAt,
      duration_minutes: durationMinutes,
      status,
    })
    .select(`
      *,
      instructor:instructors(*, user:users(*))
    `)
    .single()

  if (error) {
    // 23P01 = exclusion_violation (overlap with another opening)
    if (error.code === '23P01') {
      return NextResponse.json(
        { error: 'Opening overlaps with an existing one for this instructor.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ opening }, { status: 201 })
}
