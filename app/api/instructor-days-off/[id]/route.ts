// DELETE /api/instructor-days-off/[id]
//   Removes a day-off entry. Triggers regeneration so the day's openings come back.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { regenerateOpenings } from '@/lib/services/openings-generator'

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
