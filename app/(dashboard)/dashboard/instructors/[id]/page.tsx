import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { ChevronLeft, Mail, Phone, Hash, BookOpen, Pencil } from 'lucide-react'

import { getInstructorById } from '@/lib/services/instructors'
import {
  listAssignmentsForInstructor,
  listDeductionsForInstructor,
  listReimbursementsForInstructor,
} from '@/lib/services/instructor-extras'
import { formatDateTime, getFullName } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InstructorStatusToggle } from '@/components/instructors/instructor-status-toggle'
import { ResendInviteButton } from '@/components/instructors/resend-invite-button'
import { DeleteInstructorButton } from '@/components/instructors/delete-instructor-button'
import { InstructorDetailTabs } from '@/components/instructors/instructor-detail-tabs'
import type { LessonStatus } from '@/types'

export const metadata: Metadata = { title: 'Instructor Details' }

const lessonStatusConfig: Record<LessonStatus, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  scheduled: { label: 'Scheduled', variant: 'secondary' },
  completed: { label: 'Completed', variant: 'default' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
  no_show: { label: 'No Show', variant: 'outline' },
}

export default async function InstructorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let instructor, upcomingLessons
  try {
    ;({ instructor, upcomingLessons } = await getInstructorById(id))
  } catch {
    notFound()
  }

  const [assignments, deductions, reimbursements] = await Promise.all([
    listAssignmentsForInstructor(id),
    listDeductionsForInstructor(id),
    listReimbursementsForInstructor(id),
  ])

  const overview = (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Profile card */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-4 w-4 flex-shrink-0" />
              <span>{instructor.user.email || '—'}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="h-4 w-4 flex-shrink-0" />
              <span>{instructor.user.phone || '—'}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Hash className="h-4 w-4 flex-shrink-0" />
              <span>License: {instructor.license_number || '—'}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <BookOpen className="h-4 w-4 flex-shrink-0" />
              <span>Max {instructor.max_lessons_per_day} lessons / day</span>
            </div>
          </CardContent>
        </Card>

        {/* Schedule note */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Templates and days off are managed by the instructor in their portal.
              The system auto-generates bookable openings for the next 14 days.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming lessons */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upcoming Lessons</CardTitle>
        </CardHeader>
        <CardContent>
          {upcomingLessons.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No upcoming lessons scheduled.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left font-medium text-muted-foreground pb-3 pr-4">Date &amp; Time</th>
                    <th className="text-left font-medium text-muted-foreground pb-3 pr-4">Student</th>
                    <th className="text-left font-medium text-muted-foreground pb-3 pr-4">Duration</th>
                    <th className="text-left font-medium text-muted-foreground pb-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {upcomingLessons.map((lesson) => {
                    const lConf = lessonStatusConfig[lesson.status]
                    return (
                      <tr key={lesson.id}>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {formatDateTime(lesson.scheduled_at)}
                        </td>
                        <td className="py-3 pr-4 font-medium">
                          {getFullName(lesson.student.user)}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {lesson.duration_minutes} min
                        </td>
                        <td className="py-3">
                          <Badge variant={lConf.variant}>{lConf.label}</Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )

  return (
    <div className="max-w-4xl space-y-6">
      <Link
        href="/dashboard/instructors"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Instructors
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">{getFullName(instructor.user)}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Instructor</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={instructor.is_active ? 'default' : 'secondary'}>
            {instructor.is_active ? 'Active' : 'Inactive'}
          </Badge>
          <ResendInviteButton instructorId={id} />
          <Link href={`/dashboard/instructors/${id}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Edit
            </Button>
          </Link>
          <InstructorStatusToggle instructor={instructor} />
          <DeleteInstructorButton instructorId={id} instructorName={getFullName(instructor.user)} />
        </div>
      </div>

      <InstructorDetailTabs
        instructorId={id}
        overview={overview}
        assignments={assignments}
        deductions={deductions}
        reimbursements={reimbursements}
      />
    </div>
  )
}
