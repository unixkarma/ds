// DELETE /api/openings/[id]
//   Removes an opening. Forbidden if status='booked' (cancel the lesson instead).
//   Admin can delete any opening in the school; instructor only their own.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

  // Fetch the opening + the owning instructor's user_id to verify ownership.
  const { data: existing } = await supabase
    .from('openings')
    .select('id, status, instructor_id, school_id, instructor:instructors(user_id)')
    .eq('id', id)
    .single()

  if (!existing || existing.school_id !== profile.school_id) {
    return NextResponse.json({ error: 'Opening not found' }, { status: 404 })
  }

  if (existing.status === 'booked') {
    return NextResponse.json(
      { error: 'Cannot delete a booked opening. Cancel the lesson instead.' },
      { status: 409 }
    )
  }

  if (profile.role === 'instructor') {
    const ownerUserId = (existing.instructor as unknown as { user_id: string } | null)?.user_id
    if (ownerUserId !== user.id) {
      return NextResponse.json(
        { error: 'Instructors can only delete their own openings.' },
        { status: 403 }
      )
    }
  }

  const adminClient = createAdminClient()
  const { error } = await adminClient.from('openings').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
