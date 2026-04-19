// POST /api/students/[id]/permit-photo — Upload permit photo
// Accepts multipart/form-data with a "file" field.
// Stores in Supabase Storage bucket "permit-photos" under {user_id}/permit.{ext}

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 5 * 1024 * 1024 // 5 MB

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: studentId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify caller is the student themselves or an admin
  const { data: profile } = await supabase
    .from('users')
    .select('role, school_id')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // If student, verify they own this record
  if (profile.role === 'student') {
    const { data: studentRecord } = await supabase
      .from('students')
      .select('id')
      .eq('id', studentId)
      .eq('user_id', user.id)
      .single()

    if (!studentRecord) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } else if (profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Parse form data
  const formData = await request.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Only JPEG, PNG, and WebP images are allowed' }, { status: 400 })
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large. Maximum size is 5 MB.' }, { status: 400 })
  }

  // Get the student's user_id for the storage path
  const adminClient = createAdminClient()
  const { data: student } = await adminClient
    .from('students')
    .select('user_id')
    .eq('id', studentId)
    .single()

  if (!student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 })
  }

  const ext = file.name.split('.').pop() || 'jpg'
  const storagePath = `${student.user_id}/permit.${ext}`

  // Upload to storage (upsert to overwrite existing)
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: uploadError } = await adminClient.storage
    .from('permit-photos')
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: true,
    })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  // Store the STORAGE PATH in students.permit_photo_url (bucket is private
  // since migration 018 — signed URLs are generated on read).
  await adminClient
    .from('students')
    .update({ permit_photo_url: storagePath })
    .eq('id', studentId)

  // Return a signed URL for immediate display in the client.
  const { data: signed } = await adminClient.storage
    .from('permit-photos')
    .createSignedUrl(storagePath, 60 * 60)

  return NextResponse.json({ url: signed?.signedUrl ?? '' })
}
