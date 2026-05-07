// PATCH /api/instructor-applications/[id]/review — Admin approves or rejects an application
// On approval, creates an auth user + users row + instructors row (same as POST /api/instructors).

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const reviewSchema = z.object({
  action: z.enum(['approve', 'reject']),
  adminNotes: z.string().optional().default(''),
  // Only needed for approval — sets up the instructor account
  password: z.string().min(6).optional(),
  licenseNumber: z.string().optional().default(''),
  modality: z.enum(['school', 'independent']).optional().default('school'),
  commissionRate: z.number().min(0).max(1).optional().default(0.10),
  hourlyRateCents: z.number().int().min(0).optional().default(0),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: applicationId } = await params

  // Auth check — must be admin
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
  const parsed = reviewSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { action, adminNotes, password, licenseNumber, modality, commissionRate, hourlyRateCents } = parsed.data
  const adminClient = createAdminClient()

  // Fetch the application
  const { data: application, error: appError } = await adminClient
    .from('instructor_applications')
    .select('*')
    .eq('id', applicationId)
    .eq('school_id', profile.school_id)
    .single()

  if (appError || !application) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  if (application.status !== 'pending') {
    return NextResponse.json(
      { error: `Application has already been ${application.status}` },
      { status: 409 }
    )
  }

  // ── REJECT ────────────────────────────────────────────────
  if (action === 'reject') {
    await adminClient
      .from('instructor_applications')
      .update({
        status: 'rejected',
        admin_notes: adminNotes || null,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', applicationId)

    return NextResponse.json({ success: true, status: 'rejected' })
  }

  // ── APPROVE ───────────────────────────────────────────────
  if (!password) {
    return NextResponse.json(
      { error: 'Password is required to create the instructor account' },
      { status: 400 }
    )
  }

  // Check if email is already in use
  const { data: existingUser } = await adminClient
    .from('users')
    .select('id')
    .eq('email', application.email)
    .maybeSingle()

  if (existingUser) {
    return NextResponse.json(
      { error: 'A user with this email already exists. Reject the application or use a different email.' },
      { status: 409 }
    )
  }

  // Create auth user
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email: application.email,
    password,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    return NextResponse.json(
      { error: authError?.message ?? 'Failed to create auth user' },
      { status: 500 }
    )
  }

  const authUserId = authData.user.id

  // Create users row
  const { error: userError } = await adminClient.from('users').insert({
    id: authUserId,
    school_id: profile.school_id,
    role: 'instructor',
    first_name: application.first_name,
    last_name: application.last_name,
    email: application.email,
    phone: application.phone,
    date_of_birth: application.date_of_birth,
  })

  if (userError) {
    await adminClient.auth.admin.deleteUser(authUserId)
    return NextResponse.json({ error: 'Failed to create user: ' + userError.message }, { status: 500 })
  }

  // Create instructors row
  const { error: instructorError } = await adminClient.from('instructors').insert({
    user_id: authUserId,
    school_id: profile.school_id,
    license_number: licenseNumber,
    modality,
    commission_rate: commissionRate,
    hourly_rate_cents: hourlyRateCents,
    service_area: application.service_area ?? '',
  })

  if (instructorError) {
    await adminClient.from('users').delete().eq('id', authUserId)
    await adminClient.auth.admin.deleteUser(authUserId)
    return NextResponse.json({ error: 'Failed to create instructor: ' + instructorError.message }, { status: 500 })
  }

  // Mark application as approved
  await adminClient
    .from('instructor_applications')
    .update({
      status: 'approved',
      admin_notes: adminNotes || null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', applicationId)

  return NextResponse.json({ success: true, status: 'approved' })
}
