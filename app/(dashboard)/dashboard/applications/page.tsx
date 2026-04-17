import type { Metadata } from 'next'
import { getInstructorApplications } from '@/lib/services/applications'
import { ApplicationsTable } from '@/components/applications/applications-table'

export const metadata: Metadata = { title: 'Instructor Applications' }

export default async function ApplicationsPage() {
  const applications = await getInstructorApplications()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Instructor Applications</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review and manage instructor applications
        </p>
      </div>

      <ApplicationsTable applications={applications} />
    </div>
  )
}
