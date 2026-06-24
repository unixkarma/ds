import { redirect } from 'next/navigation'

import { getInstructorPortalData } from '@/lib/services/instructor-portal'
import { listReimbursementsForInstructor } from '@/lib/services/instructor-extras'
import { ReimbursementForm } from '@/components/instructor/reimbursement-form'

export default async function InstructorReimbursementsPage() {
  const data = await getInstructorPortalData()
  if (!data) redirect('/login')

  const reimbursements = await listReimbursementsForInstructor(data.instructor.id)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reimbursements</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Submit expenses for reimbursement and track their status.
        </p>
      </div>
      <ReimbursementForm reimbursements={reimbursements} />
    </div>
  )
}
