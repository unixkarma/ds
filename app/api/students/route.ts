// POST /api/students — Create a new student
// Only accessible to admins. Uses the service role key to:
//   1. Invite the student via email (they set their own password)
//   2. Create the users row with role='student'
//   3. Create the students row

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const createStudentSchema = z
  .object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(6),
    phone: z.string().min(1, 'Phone is required'),
    dateOfBirth: z.string().min(1, 'Date of birth is required'),
    ageGroup: z.enum(['teen', 'adult']).default('adult'),
    notes: z.string().optional().nullable(),
    parent1Name: z.string().optional().nullable(),
    parent1Phone: z.string().optional().nullable(),
    parent1Email: z.string().email().or(z.literal('')).optional().nullable(),
    parent2Name: z.string().optional().nullable(),
    parent2Phone: z.string().optional().nullable(),
    parent2Email: z.string().email().or(z.literal('')).optional().nullable(),
  })
  .refine((d) => (d.parent1Phone?.trim() ?? '') !== '' || (d.parent2Phone?.trim() ?? '') !== '', {
    message: 'At least one parent/emergency contact phone is required',
    path: ['parent1Phone'],
  })

export async function POST(request: NextRequest) {
  // 1. Verify the caller is an authenticated admin
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

  // 2. Validate request body
  const body = await request.json()
  const parsed = createStudentSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const {
    firstName,
    lastName,
    email,
    password,
    phone,
    dateOfBirth,
    ageGroup,
    notes,
    parent1Name,
    parent1Phone,
    parent1Email,
    parent2Name,
    parent2Phone,
    parent2Email,
  } = parsed.data
  const schoolId = profile.school_id

  const adminClient = createAdminClient()

  // 3. Create the auth user with the password set by the admin.
  //    email_confirm: true so they can log in immediately.
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

  // 4. Create the public users row manually (trigger skipped, no school_name)
  const { error: userInsertError } = await adminClient.from('users').insert({
    id: authUserId,
    school_id: schoolId,
    role: 'student',
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    date_of_birth: dateOfBirth,
  })

  if (userInsertError) {
    // Clean up: delete the auth user so they can re-register
    await adminClient.auth.admin.deleteUser(authUserId)
    return NextResponse.json({ error: userInsertError.message }, { status: 500 })
  }

  // 5. Create the students row
  const { data: student, error: studentInsertError } = await adminClient
    .from('students')
    .insert({
      user_id: authUserId,
      school_id: schoolId,
      age_group: ageGroup,
      notes: notes ?? null,
      parent1_name: parent1Name ?? '',
      parent1_phone: parent1Phone ?? '',
      parent1_email: parent1Email ?? '',
      parent2_name: parent2Name ?? '',
      parent2_phone: parent2Phone ?? '',
      parent2_email: parent2Email ?? '',
    })
    .select('*, user:users!user_id(*)')
    .single()

  if (studentInsertError) {
    await adminClient.auth.admin.deleteUser(authUserId)
    return NextResponse.json({ error: studentInsertError.message }, { status: 500 })
  }

  return NextResponse.json({ student }, { status: 201 })
}
