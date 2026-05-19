// PATCH /api/students/[id] — Update student profile or status

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const updateStudentSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
  dateOfBirth: z.string().nullable().optional(),
  ageGroup: z.enum(['teen', 'adult']).optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(['active', 'inactive', 'completed']).optional(),
  totalLessonsPurchased: z.number().int().min(0).optional(),
  parent1Name: z.string().optional(),
  parent1Phone: z.string().optional(),
  parent1Email: z.string().email().or(z.literal('')).optional(),
  parent2Name: z.string().optional(),
  parent2Phone: z.string().optional(),
  parent2Email: z.string().email().or(z.literal('')).optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Verify admin session
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role, school_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = updateStudentSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const updates = parsed.data
  const adminClient = createAdminClient()

  // Update students table fields
  const studentUpdates: Record<string, unknown> = {}
  if (updates.status !== undefined) studentUpdates.status = updates.status
  if (updates.notes !== undefined) studentUpdates.notes = updates.notes
  if (updates.ageGroup !== undefined) studentUpdates.age_group = updates.ageGroup
  if (updates.totalLessonsPurchased !== undefined)
    studentUpdates.total_lessons_purchased = updates.totalLessonsPurchased
  if (updates.parent1Name !== undefined) studentUpdates.parent1_name = updates.parent1Name
  if (updates.parent1Phone !== undefined) studentUpdates.parent1_phone = updates.parent1Phone
  if (updates.parent1Email !== undefined) studentUpdates.parent1_email = updates.parent1Email
  if (updates.parent2Name !== undefined) studentUpdates.parent2_name = updates.parent2Name
  if (updates.parent2Phone !== undefined) studentUpdates.parent2_phone = updates.parent2Phone
  if (updates.parent2Email !== undefined) studentUpdates.parent2_email = updates.parent2Email

  // Update users table fields (name, phone, DOB)
  const userUpdates: Record<string, unknown> = {}
  if (updates.firstName !== undefined) userUpdates.first_name = updates.firstName
  if (updates.lastName !== undefined) userUpdates.last_name = updates.lastName
  if (updates.phone !== undefined) userUpdates.phone = updates.phone
  if (updates.dateOfBirth !== undefined) userUpdates.date_of_birth = updates.dateOfBirth

  // Fetch the student to get user_id, scoped to the admin's school
  const { data: existing } = await supabase
    .from('students')
    .select('user_id')
    .eq('id', id)
    .eq('school_id', profile.school_id)
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 })
  }

  // Run updates (sequentially — Supabase builders need to be awaited directly)
  if (Object.keys(studentUpdates).length > 0) {
    await adminClient.from('students').update(studentUpdates).eq('id', id)
  }

  if (Object.keys(userUpdates).length > 0) {
    await adminClient.from('users').update(userUpdates).eq('id', existing.user_id)
  }

  return NextResponse.json({ success: true })
}
