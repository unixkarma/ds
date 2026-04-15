// POST /api/instructors — Create a new instructor
// Invites the user by email and creates the users + instructors rows.

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const createInstructorSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().optional().default(''),
  licenseNumber: z.string().optional().default(''),
  maxLessonsPerDay: z.number().int().min(1).max(20).optional().default(6),
  modality: z.enum(['school', 'independent']).optional().default('school'),
  commissionRate: z.number().min(0).max(1).optional().default(0.10),
  hourlyRateCents: z.number().int().min(0).optional().default(0),
  lessonPriceCents: z.number().int().min(0).nullable().optional().default(null),
  usesSchoolVehicle: z.boolean().optional().default(false),
  vehicleMonthlyFeeCents: z.number().int().min(0).optional().default(0),
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
  const parsed = createInstructorSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const {
    firstName, lastName, email, password, phone, licenseNumber, maxLessonsPerDay,
    modality, commissionRate, hourlyRateCents, lessonPriceCents,
    usesSchoolVehicle, vehicleMonthlyFeeCents,
  } = parsed.data
  const schoolId = profile.school_id
  const adminClient = createAdminClient()

  const { data: createData, error: createError } =
    await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 422 })
  }

  const authUserId = createData.user.id

  // Create the users row (trigger skipped — no school_name in invite metadata)
  const { error: userInsertError } = await adminClient.from('users').insert({
    id: authUserId,
    school_id: schoolId,
    role: 'instructor',
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
  })

  if (userInsertError) {
    await adminClient.auth.admin.deleteUser(authUserId)
    return NextResponse.json({ error: userInsertError.message }, { status: 500 })
  }

  // Create the instructors row
  const { data: instructor, error: instructorInsertError } = await adminClient
    .from('instructors')
    .insert({
      user_id: authUserId,
      school_id: schoolId,
      license_number: licenseNumber,
      max_lessons_per_day: maxLessonsPerDay,
      modality,
      commission_rate: commissionRate,
      hourly_rate_cents: hourlyRateCents,
      lesson_price_cents: lessonPriceCents,
      uses_school_vehicle: usesSchoolVehicle,
      vehicle_monthly_fee_cents: vehicleMonthlyFeeCents,
    })
    .select('*, user:users(*)')
    .single()

  if (instructorInsertError) {
    await adminClient.auth.admin.deleteUser(authUserId)
    return NextResponse.json({ error: instructorInsertError.message }, { status: 500 })
  }

  return NextResponse.json({ instructor }, { status: 201 })
}
