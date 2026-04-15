import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { ChevronLeft, Mail, Phone, Hash, BookOpen, Pencil, Send } from 'lucide-react'

import { getInstructorById } from '@/lib/services/instructors'
import { formatDateTime, formatTime, getFullName, DAY_LABELS } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { AvailabilityForm } from '@/components/instructors/availability-form'
import { InstructorStatusToggle } from '@/components/instructors/instructor-status-toggle'
import { ResendInviteButton } from '@/components/instructors/resend-invite-button'
import type { LessonStatus } from '@/types'

export const metadata: Metadata = { title: 'Instructor Details' }

const lessonStatusConfig: Record<LessonStatus, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  scheduled: { label: 'Scheduled', variant: 'secondary' },
  completed: { label: 'Completed', variant: 'default' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
  no_show: { label: 'No Show', variant: 'outline' },
}

// Days ordered Mon–Sun (same order as AvailabilityForm)
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

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
        </div>
      </div>

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

        {/* Weekly availability (read-only summary) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">This Week&apos;s Hours</CardTitle>
          </CardHeader>
          <CardContent>
            {instructor.availability.length === 0 ? (
              <p className="text-sm text-muted-foreground">No availability set.</p>
            ) : (
              <div className="space-y-1 text-sm">
                {DAY_ORDER.map((day) => {
                  const slot = instructor.availability.find((a) => a.day_of_week === day)
                  if (!slot) return null
                  return (
                    <div key={day} className="flex justify-between">
                      <span className="text-muted-foreground">{DAY_LABELS[day].slice(0, 3)}</span>
                      <span>
                        {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Availability editor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Weekly Availability</CardTitle>
        </CardHeader>
        <CardContent>
          <AvailabilityForm instructorId={id} existing={instructor.availability} />
        </CardContent>
      </Card>

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
}
