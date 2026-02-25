// PUT /api/instructors/[id]/availability — Replace all availability slots
// Deletes all existing slots for the instructor and inserts the new ones.

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const slotSchema = z.object({
  day_of_week: z.number().int().min(0).max(6),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Format must be HH:MM'),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, 'Format must be HH:MM'),
})

const availabilitySchema = z.object({
  slots: z.array(slotSchema),
})

export async function PUT(
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

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Validate the instructor belongs to this school
  const { data: instructor } = await supabase
    .from('instructors')
    .select('id')
    .eq('id', id)
    .eq('school_id', profile.school_id)
    .single()

  if (!instructor) {
    return NextResponse.json({ error: 'Instructor not found' }, { status: 404 })
  }

  const body = await request.json()
  const parsed = availabilitySchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const adminClient = createAdminClient()

  // Validate no slot has end_time <= start_time
  for (const slot of parsed.data.slots) {
    if (slot.end_time <= slot.start_time) {
      return NextResponse.json(
        { error: `End time must be after start time (day ${slot.day_of_week})` },
        { status: 400 }
      )
    }
  }

  // Replace: delete all existing slots, then insert new ones
  await adminClient.from('availability').delete().eq('instructor_id', id)

  if (parsed.data.slots.length > 0) {
    const rows = parsed.data.slots.map((slot) => ({
      instructor_id: id,
      day_of_week: slot.day_of_week,
      start_time: slot.start_time,
      end_time: slot.end_time,
    }))

    const { error } = await adminClient.from('availability').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
