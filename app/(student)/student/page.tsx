import { redirect } from 'next/navigation'
import { format } from 'date-fns'
import { CalendarDays, CheckCircle, Clock, BookOpen } from 'lucide-react'

import { getStudentPortalData } from '@/lib/services/student-portal'
import { getPermitPhotoSignedUrl } from '@/lib/services/permit-photo'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PermitUpload } from '@/components/student/permit-upload'
import type { LessonWithRelations, LessonStatus } from '@/types'

const STATUS_BADGE: Record<LessonStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  scheduled: 'default',
  completed: 'secondary',
  cancelled: 'outline',
  no_show: 'destructive',
}

export default async function StudentPortalPage() {
  const data = await getStudentPortalData()

  if (!data) redirect('/login')

  const { student, upcomingLessons, recentLessons } = data
  const lessonsRemaining = student.lessons_remaining ?? 0
  const permitPhotoUrl = await getPermitPhotoSignedUrl(student.permit_photo_url)

  return (
    <div className="space-y-8">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome back, {student.user.first_name}!
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Here&apos;s an overview of your driving progress.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={BookOpen}
          label="Lessons Purchased"
          value={student.total_lessons_purchased}
          iconClass="text-blue-500"
        />
        <StatCard
          icon={CheckCircle}
          label="Lessons Completed"
          value={student.total_lessons_completed}
          iconClass="text-emerald-500"
        />
        <StatCard
          icon={Clock}
          label="Lessons Remaining"
          value={Math.max(lessonsRemaining, 0)}
          iconClass="text-amber-500"
        />
      </div>

      {/* Permit photo upload */}
      <PermitUpload
        studentId={student.id}
        existingUrl={permitPhotoUrl ?? ''}
      />

      {/* Upcoming lessons */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4" />
            Upcoming Lessons
          </CardTitle>
        </CardHeader>
        <CardContent>
          {upcomingLessons.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No upcoming lessons scheduled.
            </p>
          ) : (
            <div className="space-y-3">
              {upcomingLessons.map(lesson => (
                <UpcomingLessonRow key={lesson.id} lesson={lesson} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lesson history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lesson History</CardTitle>
        </CardHeader>
        <CardContent>
          {recentLessons.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No past lessons yet.
            </p>
          ) : (
            <div className="space-y-3">
              {recentLessons.map(lesson => {
                const start = new Date(lesson.scheduled_at)
                const hasNotes = lesson.notes_covered || lesson.notes_practice || lesson.notes_additional
                return (
                  <div key={lesson.id} className="border rounded-lg p-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm">
                          {format(start, 'MMM d, yyyy')} · {format(start, 'h:mm a')}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {lesson.instructor.user.first_name}{' '}
                          {lesson.instructor.user.last_name}
                          <span className="mx-1.5">·</span>
                          {lesson.duration_minutes} min
                        </p>
                      </div>
                      <Badge variant={STATUS_BADGE[lesson.status]} className="shrink-0">
                        {lesson.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    {hasNotes && (
                      <div className="text-xs text-muted-foreground space-y-0.5 pt-1 border-t">
                        {lesson.notes_covered && (
                          <p><span className="font-medium">Covered:</span> {lesson.notes_covered}</p>
                        )}
                        {lesson.notes_practice && (
                          <p><span className="font-medium">Practice:</span> {lesson.notes_practice}</p>
                        )}
                        {lesson.notes_additional && (
                          <p><span className="font-medium">Notes:</span> {lesson.notes_additional}</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  iconClass,
}: {
  icon: React.ElementType
  label: string
  value: number
  iconClass: string
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center gap-3">
          <Icon className={`h-5 w-5 ${iconClass} shrink-0`} />
          <div>
            <p className="text-2xl font-bold leading-none">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function UpcomingLessonRow({ lesson }: { lesson: LessonWithRelations }) {
  const start = new Date(lesson.scheduled_at)
  const end = new Date(start.getTime() + lesson.duration_minutes * 60 * 1000)

  return (
    <div className="flex items-start gap-4 rounded-lg border p-3">
      {/* Date block */}
      <div className="flex-none text-center w-12">
        <div className="text-xs font-medium text-muted-foreground uppercase">
          {format(start, 'MMM')}
        </div>
        <div className="text-2xl font-bold leading-none">{format(start, 'd')}</div>
        <div className="text-xs text-muted-foreground">{format(start, 'EEE')}</div>
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">
          {format(start, 'h:mm a')} – {format(end, 'h:mm a')}
        </p>
        <p className="text-sm text-muted-foreground">
          with {lesson.instructor.user.first_name} {lesson.instructor.user.last_name}
        </p>
        {lesson.instructor.service_area && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Area: {lesson.instructor.service_area}
          </p>
        )}
        {lesson.vehicle && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {lesson.vehicle.year} {lesson.vehicle.make} {lesson.vehicle.model}
          </p>
        )}
      </div>

      <div className="flex-none text-xs text-muted-foreground">
        {lesson.duration_minutes} min
      </div>
    </div>
  )
}
