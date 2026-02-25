import type { Metadata } from 'next'
import { getStudents } from '@/lib/services/students'
import { StudentTable } from '@/components/students/student-table'

export const metadata: Metadata = { title: 'Students' }

export default async function StudentsPage() {
  const students = await getStudents()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Students</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your enrolled students
        </p>
      </div>

      <StudentTable students={students} />
    </div>
  )
}
