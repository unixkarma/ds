import type { Metadata } from 'next'
import { getInstructors } from '@/lib/services/instructors'
import { InstructorTable } from '@/components/instructors/instructor-table'

export const metadata: Metadata = { title: 'Instructors' }

export default async function InstructorsPage() {
  const instructors = await getInstructors()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Instructors</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your teaching staff
        </p>
      </div>

      <InstructorTable instructors={instructors} />
    </div>
  )
}
