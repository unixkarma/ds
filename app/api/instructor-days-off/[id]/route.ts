// PATCH  /api/instructor-days-off/[id]
//   Admin approves or rejects an instructor's day-off request.
// DELETE /api/instructor-days-off/[id]
//   Removes a day-off entry. Triggers regeneration so the day's openings come back.

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { regenerateOpenings } from '@/lib/services/openings-generator'

const reviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
})

// ── PATCH (admin approve / reject) ─────────────────────────────
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
  // Only admins can approve/reject day-off requests.
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = reviewSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }
  const { status } = parsed.data

  const { data: existing } = await supabase
    .from('instructor_days_off')
    .select('id, school_id, instructor_id, date')
    .eq('id', id)
    .single()

  if (!existing || existing.school_id !== profile.school_id) {
    return NextResponse.json({ error: 'Day off not found' }, { status: 404 })
  }

  const adminClient = createAdminClient()

  // Approving means the day becomes blocking — make sure no booked lesson exists.
  if (status === 'approved') {
    const dayStart = new Date(existing.date + 'T00:00:00').toISOString()
    const nextDay = new Date(existing.date + 'T00:00:00')
    nextDay.setDate(nextDay.getDate() + 1)

    const { data: bookedOnDay } = await adminClient
      .from('openings')
      .select('id')
      .eq('instructor_id', existing.instructor_id)
      .eq('status', 'booked')
      .gte('scheduled_at', dayStart)
      .lt('scheduled_at', nextDay.toISOString())

    if ((bookedOnDay ?? []).length > 0) {
      return NextResponse.json(
        {
          error: `There are ${bookedOnDay!.length} booked lesson(s) on ${existing.date}. Cancel them first before approving.`,
        },
        { status: 409 }
      )
    }
  }

  const { error } = await adminClient
    .from('instructor_days_off')
    .update({ status, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Regenerate either way: approving removes that day's openings, rejecting
  // (a previously-approved day) brings them back.
  await regenerateOpenings({
    instructorId: existing.instructor_id,
    schoolId: profile.school_id,
  })

  return NextResponse.json({ success: true })
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
  if (!profile || (profile.role !== 'admin' && profile.role !== 'instructor')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Load the row + check ownership
  const { data: existing } = await supabase
    .from('instructor_days_off')
    .select('id, school_id, instructor_id, instructor:instructors(user_id)')
    .eq('id', id)
    .single()

  if (!existing || existing.school_id !== profile.school_id) {
    return NextResponse.json({ error: 'Day off not found' }, { status: 404 })
  }

  if (profile.role === 'instructor') {
    const ownerUserId = (existing.instructor as unknown as { user_id: string } | null)?.user_id
    if (ownerUserId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const adminClient = createAdminClient()
  const { error } = await adminClient.from('instructor_days_off').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Regenerate so the day's openings come back.
  await regenerateOpenings({
    instructorId: existing.instructor_id,
    schoolId: profile.school_id,
  })

  return NextResponse.json({ success: true })
}
