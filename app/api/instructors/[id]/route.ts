// PATCH /api/instructors/[id] — Update instructor profile or active status

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const updateInstructorSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
  licenseNumber: z.string().optional(),
  maxLessonsPerDay: z.number().int().min(1).max(20).optional(),
  isActive: z.boolean().optional(),
  modality: z.enum(['school', 'independent']).optional(),
  commissionRate: z.number().min(0).max(1).optional(),
  hourlyRateCents: z.number().int().min(0).optional(),
  lessonPriceCents: z.number().int().min(0).nullable().optional(),
  usesSchoolVehicle: z.boolean().optional(),
  vehicleMonthlyFeeCents: z.number().int().min(0).optional(),
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

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = updateInstructorSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const updates = parsed.data
  const adminClient = createAdminClient()

  // Verify the instructor belongs to this school
  const { data: existing } = await supabase
    .from('instructors')
    .select('user_id')
    .eq('id', id)
    .eq('school_id', profile.school_id)
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'Instructor not found' }, { status: 404 })
  }

  // Split updates between instructors and users tables
  const instructorUpdates: Record<string, unknown> = {}
  if (updates.licenseNumber !== undefined) instructorUpdates.license_number = updates.licenseNumber
  if (updates.maxLessonsPerDay !== undefined) instructorUpdates.max_lessons_per_day = updates.maxLessonsPerDay
  if (updates.isActive !== undefined) instructorUpdates.is_active = updates.isActive
  if (updates.modality !== undefined) instructorUpdates.modality = updates.modality
  if (updates.commissionRate !== undefined) instructorUpdates.commission_rate = updates.commissionRate
  if (updates.hourlyRateCents !== undefined) instructorUpdates.hourly_rate_cents = updates.hourlyRateCents
  if (updates.lessonPriceCents !== undefined) instructorUpdates.lesson_price_cents = updates.lessonPriceCents
  if (updates.usesSchoolVehicle !== undefined) instructorUpdates.uses_school_vehicle = updates.usesSchoolVehicle
  if (updates.vehicleMonthlyFeeCents !== undefined) instructorUpdates.vehicle_monthly_fee_cents = updates.vehicleMonthlyFeeCents

  const userUpdates: Record<string, unknown> = {}
  if (updates.firstName !== undefined) userUpdates.first_name = updates.firstName
  if (updates.lastName !== undefined) userUpdates.last_name = updates.lastName
  if (updates.phone !== undefined) userUpdates.phone = updates.phone

  if (Object.keys(instructorUpdates).length > 0) {
    await adminClient.from('instructors').update(instructorUpdates).eq('id', id)
  }

  if (Object.keys(userUpdates).length > 0) {
    await adminClient.from('users').update(userUpdates).eq('id', existing.user_id)
  }

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

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Verify the instructor belongs to this school
  const { data: existing } = await supabase
    .from('instructors')
    .select('user_id')
    .eq('id', id)
    .eq('school_id', profile.school_id)
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'Instructor not found' }, { status: 404 })
  }

  const adminClient = createAdminClient()

  // Delete instructor row, then users row, then auth user
  await adminClient.from('instructors').delete().eq('id', id)
  await adminClient.from('users').delete().eq('id', existing.user_id)
  await adminClient.auth.admin.deleteUser(existing.user_id)

  return NextResponse.json({ success: true })
}
