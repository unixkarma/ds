import { redirect } from 'next/navigation'
import { format } from 'date-fns'
import { CalendarDays, CheckCircle, Clock, Users } from 'lucide-react'

import { getInstructorPortalData } from '@/lib/services/instructor-portal'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { LessonWithRelations, LessonStatus } from '@/types'

const STATUS_BADGE: Record<LessonStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  scheduled: 'default',
  completed: 'secondary',
  cancelled: 'outline',
  no_show: 'destructive',
}

export default async function InstructorDashboardPage() {
  const data = await getInstructorPortalData()
  if (!data) redirect('/login')

  const { instructor, todayLessons, upcomingLessons, completedCount } = data

  return (
    <div className="space-y-8">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome back, {instructor.user.first_name}!
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Here&apos;s your teaching overview.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={CalendarDays}
          label="Today's Lessons"
          value={todayLessons.length}
          iconClass="text-blue-500"
        />
        <StatCard
          icon={Clock}
          label="Upcoming"
          value={upcomingLessons.length}
          iconClass="text-amber-500"
        />
        <StatCard
          icon={CheckCircle}
          label="Completed"
          value={completedCount}
          iconClass="text-emerald-500"
        />
      </div>

      {/* Today's lessons */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4" />
            Today&apos;s Lessons
          </CardTitle>
        </CardHeader>
        <CardContent>
          {todayLessons.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No lessons scheduled for today.
            </p>
          ) : (
            <div className="space-y-3">
              {todayLessons.map(lesson => (
                <LessonRow key={lesson.id} lesson={lesson} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upcoming lessons */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Upcoming Lessons
          </CardTitle>
        </CardHeader>
        <CardContent>
          {upcomingLessons.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No upcoming lessons.
            </p>
          ) : (
            <div className="space-y-3">
              {upcomingLessons.map(lesson => (
                <LessonRow key={lesson.id} lesson={lesson} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

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

function LessonRow({ lesson }: { lesson: LessonWithRelations }) {
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
          Student: {lesson.student.user.first_name} {lesson.student.user.last_name}
        </p>
        {lesson.vehicle && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {lesson.vehicle.year} {lesson.vehicle.make} {lesson.vehicle.model}
          </p>
        )}
      </div>

      <div className="flex-none flex items-center gap-2">
        <Badge variant={STATUS_BADGE[lesson.status]}>
          {lesson.status.replace('_', ' ')}
        </Badge>
        <span className="text-xs text-muted-foreground">{lesson.duration_minutes} min</span>
      </div>
    </div>
  )
}
