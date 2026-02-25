import { redirect } from 'next/navigation'
import { format } from 'date-fns'
import { CalendarDays, CheckCircle, Clock, BookOpen } from 'lucide-react'

import { getStudentPortalData } from '@/lib/services/student-portal'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
  const lessonsRemaining =
    student.total_lessons_purchased - student.total_lessons_completed

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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs uppercase">
                    <th className="text-left pb-2 font-medium">Date</th>
                    <th className="text-left pb-2 font-medium">Instructor</th>
                    <th className="text-left pb-2 font-medium">Duration</th>
                    <th className="text-left pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {recentLessons.map(lesson => {
                    const start = new Date(lesson.scheduled_at)
                    return (
                      <tr key={lesson.id} className="py-2">
                        <td className="py-2.5 pr-4">
                          <div className="font-medium">{format(start, 'MMM d, yyyy')}</div>
                          <div className="text-xs text-muted-foreground">{format(start, 'h:mm a')}</div>
                        </td>
                        <td className="py-2.5 pr-4">
                          {lesson.instructor.user.first_name}{' '}
                          {lesson.instructor.user.last_name}
                        </td>
                        <td className="py-2.5 pr-4">{lesson.duration_minutes} min</td>
                        <td className="py-2.5">
                          <Badge variant={STATUS_BADGE[lesson.status]}>
                            {lesson.status.replace('_', ' ')}
                          </Badge>
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
