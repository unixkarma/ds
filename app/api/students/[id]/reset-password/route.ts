// POST /api/students/[id]/reset-password — Admin resets a student's password.
// Two modes:
//   { mode: 'set', password }  → admin sets a new password directly (share with student)
//   { mode: 'email' }          → send the student a reset-password email (forgot-password flow)

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const bodySchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('set'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
  }),
  z.object({ mode: z.literal('email') }),
])

export async function POST(
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
  const parsed = bodySchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  // Fetch the student (and email), scoped to the admin's school
  const { data: student } = await supabase
    .from('students')
    .select('user_id, user:users!user_id(email)')
    .eq('id', id)
    .eq('school_id', profile.school_id)
    .single()

  if (!student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 })
  }

  const email = (student.user as unknown as { email: string }).email

  if (parsed.data.mode === 'set') {
    const adminClient = createAdminClient()
    const { error } = await adminClient.auth.admin.updateUserById(student.user_id, {
      password: parsed.data.password,
    })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 422 })
    }
    return NextResponse.json({ success: true })
  }

  // mode === 'email' — send the standard reset link to the student's inbox
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/auth/update-password`
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 422 })
  }

  return NextResponse.json({ success: true, email })
}
