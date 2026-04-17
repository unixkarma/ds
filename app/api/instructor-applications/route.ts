// POST /api/instructor-applications — Public endpoint for instructor applications
// Accepts multipart/form-data with personal info + document files.

import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ALLOWED_DOC_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

export async function POST(request: NextRequest) {
  const formData = await request.formData()

  // Extract fields
  const registrationCode = formData.get('registrationCode') as string | null
  const firstName = formData.get('firstName') as string | null
  const lastName = formData.get('lastName') as string | null
  const email = formData.get('email') as string | null
  const phone = (formData.get('phone') as string) ?? ''
  const serviceArea = (formData.get('serviceArea') as string) ?? ''
  const workersCompDoc = formData.get('workersCompDoc') as File | null
  const carInsuranceDoc = formData.get('carInsuranceDoc') as File | null

  // Validate required fields
  if (!registrationCode || !firstName || !lastName || !email) {
    return NextResponse.json(
      { error: 'Missing required fields: registrationCode, firstName, lastName, email' },
      { status: 400 }
    )
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }

  // Validate files
  for (const [label, file] of [
    ['Workers Compensation document', workersCompDoc],
    ['Car Insurance document', carInsuranceDoc],
  ] as const) {
    if (!file) {
      return NextResponse.json({ error: `${label} is required` }, { status: 400 })
    }
    if (!ALLOWED_DOC_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `${label}: Only PDF, JPEG, PNG, and WebP files are allowed` },
        { status: 400 }
      )
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `${label}: File too large. Maximum size is 10 MB.` },
        { status: 400 }
      )
    }
  }

  const adminClient = createAdminClient()

  // Look up school by registration code
  const { data: school, error: schoolError } = await adminClient
    .from('schools')
    .select('id, name')
    .eq('registration_code', registrationCode)
    .single()

  if (schoolError || !school) {
    return NextResponse.json(
      { error: 'Invalid registration code. Please check the link from your school.' },
      { status: 400 }
    )
  }

  // Check for duplicate pending application with same email
  const { data: existing } = await adminClient
    .from('instructor_applications')
    .select('id')
    .eq('school_id', school.id)
    .eq('email', email.toLowerCase())
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: 'An application with this email is already pending review.' },
      { status: 409 }
    )
  }

  // Create the application record first to get the ID
  const { data: application, error: insertError } = await adminClient
    .from('instructor_applications')
    .insert({
      school_id: school.id,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      service_area: serviceArea.trim(),
    })
    .select('id')
    .single()

  if (insertError || !application) {
    return NextResponse.json(
      { error: 'Failed to create application: ' + (insertError?.message ?? 'Unknown error') },
      { status: 500 }
    )
  }

  const appId = application.id

  // Upload documents to Supabase Storage (private bucket)
  async function uploadDoc(file: File, docType: string): Promise<string | null> {
    const ext = file.name.split('.').pop() || 'pdf'
    const storagePath = `${appId}/${docType}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await adminClient.storage
      .from('instructor-documents')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) {
      console.error(`Upload error for ${docType}:`, uploadError.message)
      return null
    }

    return storagePath
  }

  const workersCompPath = await uploadDoc(workersCompDoc!, 'workers-comp')
  const carInsurancePath = await uploadDoc(carInsuranceDoc!, 'car-insurance')

  if (!workersCompPath || !carInsurancePath) {
    // Rollback: delete the application
    await adminClient.from('instructor_applications').delete().eq('id', appId)
    return NextResponse.json(
      { error: 'Failed to upload documents. Please try again.' },
      { status: 500 }
    )
  }

  // Update the application with document paths
  await adminClient
    .from('instructor_applications')
    .update({
      workers_comp_doc_url: workersCompPath,
      car_insurance_doc_url: carInsurancePath,
    })
    .eq('id', appId)

  return NextResponse.json(
    { success: true, schoolName: school.name },
    { status: 201 }
  )
}
