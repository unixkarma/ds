// /api/instructor/reimbursements — instructor portal.
//   POST → submit a reimbursement (multipart: date, amountCents, detail, optional file)
//   GET  → list the caller's own reimbursements
// Evidence is stored privately in the "reimbursement-evidence" bucket and
// served on demand via /api/reimbursements/[id]/evidence (signed URL).

import { NextResponse, type NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

async function getInstructor() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }

  const { data: instructor } = await supabase
    .from('instructors')
    .select('id, school_id')
    .eq('user_id', user.id)
    .single()

  if (!instructor) return { error: 'Forbidden', status: 403 as const }
  return { supabase, user, instructor }
}

export async function GET() {
  const auth = await getInstructor()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data, error } = await auth.supabase
    .from('instructor_reimbursements')
    .select('*')
    .eq('instructor_id', auth.instructor.id)
    .order('date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reimbursements: data ?? [] })
}

export async function POST(request: NextRequest) {
  const auth = await getInstructor()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const formData = await request.formData()
  const date = formData.get('date') as string | null
  const amountRaw = formData.get('amountCents') as string | null
  const detail = (formData.get('detail') as string | null) ?? ''
  const file = formData.get('file') as File | null

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'A valid date is required' }, { status: 400 })
  }
  const amountCents = Number(amountRaw)
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    return NextResponse.json({ error: 'A valid amount is required' }, { status: 400 })
  }

  const adminClient = createAdminClient()
  let evidencePath: string | null = null

  if (file && file.size > 0) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Only JPEG, PNG, WebP, or PDF files are allowed' }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum size is 10 MB.' }, { status: 400 })
    }

    const ext = file.name.split('.').pop() || 'bin'
    const storagePath = `${auth.user.id}/${randomUUID()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: uploadError } = await adminClient.storage
      .from('reimbursement-evidence')
      .upload(storagePath, buffer, { contentType: file.type, upsert: false })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }
    evidencePath = storagePath
  }

  const { error } = await adminClient.from('instructor_reimbursements').insert({
    school_id: auth.instructor.school_id,
    instructor_id: auth.instructor.id,
    date,
    amount_cents: amountCents,
    detail,
    evidence_path: evidencePath,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
