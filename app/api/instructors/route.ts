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
  phone: z.string().optional().default(''),
  licenseNumber: z.string().optional().default(''),
  maxLessonsPerDay: z.number().int().min(1).max(20).optional().default(6),
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

  const { firstName, lastName, email, phone, licenseNumber, maxLessonsPerDay } = parsed.data
  const schoolId = profile.school_id
  const adminClient = createAdminClient()

  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/auth/update-password`

  const { data: inviteData, error: inviteError } =
    await adminClient.auth.admin.inviteUserByEmail(email, { redirectTo })

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 422 })
  }

  const authUserId = inviteData.user.id

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
    })
    .select('*, user:users(*)')
    .single()

  if (instructorInsertError) {
    await adminClient.auth.admin.deleteUser(authUserId)
    return NextResponse.json({ error: instructorInsertError.message }, { status: 500 })
  }

  return NextResponse.json({ instructor }, { status: 201 })
}
