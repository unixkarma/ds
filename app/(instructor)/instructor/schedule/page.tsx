import { redirect } from 'next/navigation'
import { format } from 'date-fns'

import { getInstructorPortalData } from '@/lib/services/instructor-portal'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LessonActions } from '@/components/instructor/lesson-actions'
import type { LessonWithRelations, LessonStatus } from '@/types'

const STATUS_BADGE: Record<LessonStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  scheduled: 'default',
  completed: 'secondary',
  cancelled: 'outline',
  no_show: 'destructive',
}

export default async function InstructorSchedulePage() {
  const data = await getInstructorPortalData()
  if (!data) redirect('/login')

  const { instructor } = data

  // Fetch all lessons for this instructor (past 30 days + future)
  const supabase = await createClient()
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: lessons } = await supabase
    .from('lessons')
    .select(`
      *,
      student:students(*, user:users!user_id(*)),
      instructor:instructors(*, user:users(*)),
      vehicle:vehicles(*)
    `)
    .eq('instructor_id', instructor.id)
    .gte('scheduled_at', thirtyDaysAgo.toISOString())
    .order('scheduled_at', { ascending: false })

  const allLessons = (lessons ?? []) as unknown as LessonWithRelations[]

  // Split into upcoming and past
  const now = new Date()
  const upcoming = allLessons
    .filter(l => new Date(l.scheduled_at) >= now && l.status === 'scheduled')
    .reverse()
  const past = allLessons.filter(
    l => new Date(l.scheduled_at) < now || l.status !== 'scheduled'
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Schedule</h1>
        <p className="text-muted-foreground text-sm mt-1">
          View all your upcoming and past lessons.
        </p>
      </div>

      {/* Upcoming */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upcoming Lessons</CardTitle>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No upcoming lessons.
            </p>
          ) : (
            <LessonTable lessons={upcoming} />
          )}
        </CardContent>
      </Card>

      {/* Past */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Past Lessons (Last 30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          {past.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No past lessons.
            </p>
          ) : (
            <LessonTable lessons={past} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function LessonTable({ lessons }: { lessons: LessonWithRelations[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground text-xs uppercase">
            <th className="text-left pb-2 font-medium">Date & Time</th>
            <th className="text-left pb-2 font-medium">Student</th>
            <th className="text-left pb-2 font-medium">Duration</th>
            <th className="text-left pb-2 font-medium">Vehicle</th>
            <th className="text-left pb-2 font-medium">Status</th>
            <th className="text-left pb-2 font-medium hidden lg:table-cell">Notes</th>
            <th className="text-left pb-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {lessons.map(lesson => {
            const start = new Date(lesson.scheduled_at)
            return (
              <tr key={lesson.id}>
                <td className="py-2.5 pr-4">
                  <div className="font-medium">{format(start, 'MMM d, yyyy')}</div>
                  <div className="text-xs text-muted-foreground">{format(start, 'h:mm a')}</div>
                </td>
                <td className="py-2.5 pr-4">
                  {lesson.student.user.first_name} {lesson.student.user.last_name}
                </td>
                <td className="py-2.5 pr-4">{lesson.duration_minutes} min</td>
                <td className="py-2.5 pr-4 text-muted-foreground">
                  {lesson.vehicle
                    ? `${lesson.vehicle.year} ${lesson.vehicle.make} ${lesson.vehicle.model}`
                    : '—'}
                </td>
                <td className="py-2.5">
                  <Badge variant={STATUS_BADGE[lesson.status]}>
                    {lesson.status.replace('_', ' ')}
                  </Badge>
                </td>
                <td className="py-2.5 hidden lg:table-cell">
                  {lesson.notes ? (
                    <p className="text-xs text-muted-foreground max-w-[200px] truncate" title={lesson.notes}>
                      {lesson.notes}
                    </p>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-2.5">
                  <LessonActions lessonId={lesson.id} status={lesson.status} existingNotes={lesson.notes} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
