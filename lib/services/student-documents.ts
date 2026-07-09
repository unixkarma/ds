// Per-student document service (migration 046).
// Files live in the PRIVATE 'student-documents' bucket; rows in
// student_documents hold metadata + the storage path. Reads mint short-lived
// signed URLs with the service-role client (the bucket is not public).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { StudentDocument, StudentDocumentType, StudentDocumentWithUrl } from '@/types'

const BUCKET = 'student-documents'
const SIGNED_URL_TTL = 60 * 10 // 10 minutes

interface Ctx {
  userId: string
  schoolId: string
  role: string
}

async function requireContext(): Promise<Ctx> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('users')
    .select('role, school_id')
    .eq('id', user.id)
    .single<{ role: string; school_id: string }>()

  if (!profile) throw new Error('Profile not found')
  return { userId: user.id, schoolId: profile.school_id, role: profile.role }
}

// Lists a student's documents with a fresh signed URL per file.
export async function listStudentDocuments(
  studentId: string,
): Promise<StudentDocumentWithUrl[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('student_documents')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  const rows = (data ?? []) as StudentDocument[]

  const admin = createAdminClient()
  const withUrls = await Promise.all(
    rows.map(async row => {
      const { data: signed } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(row.file_path, SIGNED_URL_TTL)
      return { ...row, signed_url: signed?.signedUrl ?? null }
    }),
  )
  return withUrls
}

export interface UploadDocumentArgs {
  studentId: string
  docType: StudentDocumentType
  file: File
}

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

export async function uploadStudentDocument(
  args: UploadDocumentArgs,
): Promise<StudentDocument> {
  const ctx = await requireContext()

  if (!ALLOWED_TYPES.includes(args.file.type)) {
    throw new Error('Only JPEG, PNG, WebP, and PDF files are allowed')
  }
  if (args.file.size > MAX_SIZE) {
    throw new Error('File too large. Maximum size is 10 MB.')
  }

  const admin = createAdminClient()

  // Confirm the student belongs to the caller's school before writing.
  const { data: student } = await admin
    .from('students')
    .select('id')
    .eq('id', args.studentId)
    .eq('school_id', ctx.schoolId)
    .single()
  if (!student) throw new Error('Student not found')

  const ext = args.file.name.split('.').pop() || 'bin'
  // Path is unique per upload; crypto.randomUUID avoids Math.random.
  const storagePath = `${args.studentId}/${crypto.randomUUID()}.${ext}`
  const buffer = Buffer.from(await args.file.arrayBuffer())

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: args.file.type, upsert: false })
  if (uploadError) throw new Error(uploadError.message)

  const { data, error } = await admin
    .from('student_documents')
    .insert({
      school_id: ctx.schoolId,
      student_id: args.studentId,
      doc_type: args.docType,
      file_path: storagePath,
      file_name: args.file.name,
      uploaded_by: ctx.userId,
    })
    .select('*')
    .single()

  if (error) {
    // Best-effort cleanup so we don't orphan the object if the row insert fails.
    await admin.storage.from(BUCKET).remove([storagePath])
    throw new Error(error.message)
  }
  return data as StudentDocument
}

export async function deleteStudentDocument(documentId: string): Promise<void> {
  const ctx = await requireContext()
  const admin = createAdminClient()

  const { data: doc } = await admin
    .from('student_documents')
    .select('id, file_path, school_id')
    .eq('id', documentId)
    .eq('school_id', ctx.schoolId)
    .single<{ id: string; file_path: string; school_id: string }>()
  if (!doc) throw new Error('Document not found')

  await admin.storage.from(BUCKET).remove([doc.file_path])
  const { error } = await admin.from('student_documents').delete().eq('id', documentId)
  if (error) throw new Error(error.message)
}
