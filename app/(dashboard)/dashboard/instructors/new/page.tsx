import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

import { InstructorForm } from '@/components/instructors/instructor-form'
import { getSchoolSettings } from '@/lib/services/settings'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata: Metadata = { title: 'Add Instructor' }

export default async function NewInstructorPage() {
  const school = await getSchoolSettings()

  return (
    <div className="max-w-2xl">
      <Link
        href="/dashboard/instructors"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Instructors
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Add New Instructor</CardTitle>
          <CardDescription>
            The instructor will receive an invite email to set their password and access the platform.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InstructorForm schoolBasePriceCents={school?.single_lesson_price_cents ?? 0} />
        </CardContent>
      </Card>
    </div>
  )
}
