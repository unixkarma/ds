// /api/reimbursements/[id]/evidence — returns a short-lived signed URL for the
// reimbursement's evidence file. Authorized for the owning instructor (RLS
// select) or an admin of the same school (RLS admin policy). The actual signed
// URL is minted with the service-role client.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // RLS ensures only the owning instructor or a same-school admin can read this row.
  const { data: reimbursement } = await supabase
    .from('instructor_reimbursements')
    .select('id, evidence_path')
    .eq('id', id)
    .single()

  if (!reimbursement) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!reimbursement.evidence_path) {
    return NextResponse.json({ error: 'No evidence attached' }, { status: 404 })
  }

  const adminClient = createAdminClient()
  const { data, error } = await adminClient.storage
    .from('reimbursement-evidence')
    .createSignedUrl(reimbursement.evidence_path, 60 * 5) // 5 minutes

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Failed to sign URL' }, { status: 500 })
  }

  return NextResponse.json({ url: data.signedUrl })
}
