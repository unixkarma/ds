// POST /api/students — Create a new student
// Only accessible to admins. Uses the service role key to:
//   1. Invite the student via email (they set their own password)
//   2. Create the users row with role='student'
//   3. Create the students row

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const createStudentSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional().default(''),
  dateOfBirth: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
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

  const { firstName, lastName, email, phone, dateOfBirth, notes } = parsed.data
  const schoolId = profile.school_id

  const adminClient = createAdminClient()

  // 3. Invite the student via Supabase Auth.
  //    They receive an email to set their own password.
  //    The trigger will NOT create a school because we pass no school_name.
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/auth/update-password`

  const { data: inviteData, error: inviteError } =
    await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo,
    })

  if (inviteError) {
    // "User already registered" is a common error if the email exists
    return NextResponse.json({ error: inviteError.message }, { status: 422 })
  }

  const authUserId = inviteData.user.id

  // 4. Create the public users row manually (trigger skipped, no school_name)
  const { error: userInsertError } = await adminClient.from('users').insert({
    id: authUserId,
    school_id: schoolId,
    role: 'student',
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    date_of_birth: dateOfBirth ?? null,
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
      notes: notes ?? null,
    })
    .select('*, user:users!user_id(*)')
    .single()

  if (studentInsertError) {
    await adminClient.auth.admin.deleteUser(authUserId)
    return NextResponse.json({ error: studentInsertError.message }, { status: 500 })
  }

  return NextResponse.json({ student }, { status: 201 })
}
