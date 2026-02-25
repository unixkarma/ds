import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { ChevronLeft } from 'lucide-react'

import { getInstructorById } from '@/lib/services/instructors'
import { getFullName } from '@/lib/utils'
import { InstructorForm } from '@/components/instructors/instructor-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata: Metadata = { title: 'Edit Instructor' }

export default async function EditInstructorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let instructor
  try {
    ;({ instructor } = await getInstructorById(id))
  } catch {
    notFound()
  }

  return (
    <div className="max-w-2xl">
      <Link
        href={`/dashboard/instructors/${id}`}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to {getFullName(instructor.user)}
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Edit Instructor</CardTitle>
          <CardDescription>
            Update profile information for {getFullName(instructor.user)}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InstructorForm instructor={instructor} />
        </CardContent>
      </Card>
    </div>
  )
}
