// PATCH /api/classroom/[id] — update or cancel a classroom session
// DELETE /api/classroom/[id] — delete a classroom session (admin only)

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const patchSchema = z.object({
  instructor_id: z.string().uuid().nullable().optional(),
  scheduled_at: z.string().datetime().optional(),
  duration_minutes: z.number().int().min(15).max(480).optional(),
  capacity: z.number().int().positive().optional(),
  topic: z.string().optional(),
  location: z.string().optional(),
  price_cents: z.number().int().min(0).optional(),
  instructor_earning_cents: z.number().int().min(0).optional(),
  notes: z.string().optional(),
  status: z.enum(['scheduled', 'completed', 'cancelled']).optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
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
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  // Instructors can only touch `status` and `notes`
  if (profile.role === 'instructor') {
    const allowedKeys: Array<keyof typeof parsed.data> = ['status', 'notes']
    const submittedKeys = Object.keys(parsed.data) as Array<keyof typeof parsed.data>
    const disallowed = submittedKeys.filter((k) => !allowedKeys.includes(k))
    if (disallowed.length > 0) {
      return NextResponse.json(
        { error: `Instructors may only modify: ${allowedKeys.join(', ')}` },
        { status: 403 }
      )
    }

    const { data: session } = await supabase
      .from('classroom_sessions')
      .select('id, instructor_id')
      .eq('id', id)
      .single()
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    const { data: inst } = await supabase
      .from('instructors')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!inst || session.instructor_id !== inst.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('classroom_sessions')
    .update(parsed.data)
    .eq('id', id)
    .eq('school_id', profile.school_id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ session: data })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
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
  const { error } = await adminClient
    .from('classroom_sessions')
    .delete()
    .eq('id', id)
    .eq('school_id', profile.school_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
