import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { ChevronLeft } from 'lucide-react'

import { getStudentById } from '@/lib/services/students'
import { getFullName } from '@/lib/utils'
import { StudentForm } from '@/components/students/student-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata: Metadata = { title: 'Edit Student' }

export default async function EditStudentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let student
  try {
    ;({ student } = await getStudentById(id))
  } catch {
    notFound()
  }

  return (
    <div className="max-w-2xl">
      <Link
        href={`/dashboard/students/${id}`}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to {getFullName(student.user)}
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Edit Student</CardTitle>
          <CardDescription>
            Update the profile information for {getFullName(student.user)}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StudentForm student={student} />
        </CardContent>
      </Card>
    </div>
  )
}
