// POST /api/register/student — Student self-registration
// Validates the school registration code, creates an auth user,
// a users row (role=student), and a students row with all detail fields.

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'

const registrationSchema = z.object({
  registrationCode: z.string().min(1, 'Registration code is required'),
  // User fields
  firstName: z.string().min(1, 'First name is required'),
  middleName: z.string().default(''),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Valid email required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  phone: z.string().min(1, 'Cell phone is required'),
  address: z.string().min(1, 'Address is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  zipCode: z.string().min(1, 'Zip code is required'),
  gender: z.string().min(1, 'Gender is required'),
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  // Student-specific fields
  emergencyContactName: z.string().min(1, 'Emergency contact name is required'),
  emergencyContactPhone: z.string().min(1, 'Emergency contact phone is required'),
  emergencyContactRelationship: z.string().min(1, 'Emergency contact relationship is required'),
  schoolReferral: z.boolean().default(false),
  roadTestStatus: z.string().default(''),
  wearsGlassesContacts: z.string().min(1, 'This field is required'),
  medicalConditions: z.string().default(''),
  howHeardAboutUs: z.string().min(1, 'This field is required'),
  hasLearnersPermit: z.boolean(),
  permitNumber: z.string().default(''),
  permitIssuedDate: z.string().nullable().default(null),
  permitExpirationDate: z.string().nullable().default(null),
})

export async function POST(request: NextRequest) {
  const body = await request.json()
  const parsed = registrationSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const data = parsed.data
  const adminClient = createAdminClient()

  // Look up the school by registration code
  const { data: school, error: schoolError } = await adminClient
    .from('schools')
    .select('id, name')
    .eq('registration_code', data.registrationCode)
    .single()

  if (schoolError || !school) {
    return NextResponse.json(
      { error: 'Invalid registration code. Please check the link from your school.' },
      { status: 400 }
    )
  }

  // Check if email is already registered
  const { data: existingUsers } = await adminClient.auth.admin.listUsers()
  const emailTaken = existingUsers?.users?.some(
    u => u.email?.toLowerCase() === data.email.toLowerCase()
  )
  if (emailTaken) {
    return NextResponse.json(
      { error: 'An account with this email already exists. Please sign in instead.' },
      { status: 409 }
    )
  }

  // Create auth user
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true, // Skip email confirmation for self-registered students
    user_metadata: {
      first_name: data.firstName,
      last_name: data.lastName,
    },
  })

  if (authError || !authData.user) {
    return NextResponse.json(
      { error: authError?.message ?? 'Failed to create account' },
      { status: 500 }
    )
  }

  const userId = authData.user.id

  // Create users row
  const { error: userError } = await adminClient.from('users').insert({
    id: userId,
    school_id: school.id,
    role: 'student',
    first_name: data.firstName,
    middle_name: data.middleName,
    last_name: data.lastName,
    phone: data.phone,
    address: data.address,
    city: data.city,
    state: data.state,
    zip_code: data.zipCode,
    gender: data.gender,
    date_of_birth: data.dateOfBirth,
  })

  if (userError) {
    // Rollback: delete the auth user
    await adminClient.auth.admin.deleteUser(userId)
    return NextResponse.json(
      { error: 'Failed to create user profile: ' + userError.message },
      { status: 500 }
    )
  }

  // Create students row
  const { error: studentError } = await adminClient.from('students').insert({
    user_id: userId,
    school_id: school.id,
    emergency_contact_name: data.emergencyContactName,
    emergency_contact_phone: data.emergencyContactPhone,
    emergency_contact_relationship: data.emergencyContactRelationship,
    school_referral: data.schoolReferral,
    road_test_status: data.roadTestStatus,
    wears_glasses_contacts: data.wearsGlassesContacts,
    medical_conditions: data.medicalConditions,
    how_heard_about_us: data.howHeardAboutUs,
    has_learners_permit: data.hasLearnersPermit,
    permit_number: data.permitNumber,
    permit_issued_date: data.permitIssuedDate || null,
    permit_expiration_date: data.permitExpirationDate || null,
  })

  if (studentError) {
    // Rollback: delete user + auth
    await adminClient.from('users').delete().eq('id', userId)
    await adminClient.auth.admin.deleteUser(userId)
    return NextResponse.json(
      { error: 'Failed to create student record: ' + studentError.message },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true, schoolName: school.name }, { status: 201 })
}
