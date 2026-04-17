// GET /api/instructor-applications/[id]/documents — Admin gets signed URLs for application documents
// Returns temporary signed URLs (valid for 1 hour) for private document access.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
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

  const adminClient = createAdminClient()

  // Fetch the application
  const { data: application } = await adminClient
    .from('instructor_applications')
    .select('workers_comp_doc_url, car_insurance_doc_url')
    .eq('id', applicationId)
    .eq('school_id', profile.school_id)
    .single()

  if (!application) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  const urls: { workersComp: string | null; carInsurance: string | null } = {
    workersComp: null,
    carInsurance: null,
  }

  // Generate signed URLs (valid for 1 hour)
  if (application.workers_comp_doc_url) {
    const { data } = await adminClient.storage
      .from('instructor-documents')
      .createSignedUrl(application.workers_comp_doc_url, 3600)
    urls.workersComp = data?.signedUrl ?? null
  }

  if (application.car_insurance_doc_url) {
    const { data } = await adminClient.storage
      .from('instructor-documents')
      .createSignedUrl(application.car_insurance_doc_url, 3600)
    urls.carInsurance = data?.signedUrl ?? null
  }

  return NextResponse.json(urls)
}
