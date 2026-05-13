import type { Metadata } from 'next'

import { getInstructors } from '@/lib/services/instructors'
import { getStudents } from '@/lib/services/students'
import { ClassroomSessionForm } from '@/components/classroom/classroom-session-form'

export const metadata: Metadata = { title: 'New classroom session' }

export default async function NewClassroomSessionPage() {
  const [instructors, students] = await Promise.all([getInstructors(), getStudents()])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">New classroom session</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Schedule a group session and enroll students.
        </p>
      </div>

      <ClassroomSessionForm
        mode="create"
        instructors={instructors.filter((i) => i.is_active)}
        students={students.filter((s) => s.status === 'active')}
      />
    </div>
  )
}
