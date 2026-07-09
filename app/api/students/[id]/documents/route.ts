// GET    /api/students/[id]/documents — list docs with signed URLs
//        (admin/instructor, or the student via RLS)
// POST   /api/students/[id]/documents — upload (multipart: file, docType) (admin/instructor)
// DELETE /api/students/[id]/documents?documentId=... — delete (admin only)

import { NextResponse, type NextRequest } from 'next/server'
import { getAuthContext } from '@/lib/api-auth'
import { serverError } from '@/lib/api-error'
import {
  deleteStudentDocument,
  listStudentDocuments,
  uploadStudentDocument,
} from '@/lib/services/student-documents'
import type { StudentDocumentType } from '@/types'

const DOC_TYPES: StudentDocumentType[] = [
  'permit',
  'id',
  'medical',
  'parental_consent',
  'certificate',
  'other',
]

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: studentId } = await params
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const documents = await listStudentDocuments(studentId)
    return NextResponse.json({ documents })
  } catch (err) {
    return serverError('GET /api/students/[id]/documents', err)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: studentId } = await params
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'admin' && ctx.role !== 'instructor') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const docTypeRaw = String(formData.get('docType') ?? 'other')
  const docType = (DOC_TYPES as string[]).includes(docTypeRaw)
    ? (docTypeRaw as StudentDocumentType)
    : 'other'

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  try {
    const document = await uploadStudentDocument({ studentId, docType, file })
    return NextResponse.json({ document })
  } catch (err) {
    // Upload validation errors are client-safe; surface their message.
    const message = err instanceof Error ? err.message : 'Upload failed'
    if (/allowed|too large|not found/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 400 })
    }
    return serverError('POST /api/students/[id]/documents', err)
  }
}

export async function DELETE(request: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const documentId = request.nextUrl.searchParams.get('documentId')
  if (!documentId) return NextResponse.json({ error: 'documentId is required' }, { status: 400 })

  try {
    await deleteStudentDocument(documentId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return serverError('DELETE /api/students/[id]/documents', err)
  }
}
