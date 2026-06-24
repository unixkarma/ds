import { redirect } from 'next/navigation'
import { format } from 'date-fns'
import { GraduationCap, MapPin, Users, ClipboardList } from 'lucide-react'

import { getInstructorPortalData } from '@/lib/services/instructor-portal'
import { listClassroomSessions } from '@/lib/services/classroom'
import { listAssignmentsForInstructor } from '@/lib/services/instructor-extras'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LessonActions } from '@/components/instructor/lesson-actions'
import type { LessonWithRelations, LessonStatus, ClassroomSessionWithRelations, InstructorAssignment } from '@/types'

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

  // Classroom sessions for this instructor (past 30 days + future)
  const allSessions = await listClassroomSessions({
    instructorId: instructor.id,
    fromDate: thirtyDaysAgo,
  })

  // Assignments for this instructor
  const allAssignments = await listAssignmentsForInstructor(instructor.id)

  // Split into upcoming and past
  const now = new Date()
  const upcoming = allLessons
    .filter(l => new Date(l.scheduled_at) >= now && l.status === 'scheduled')
    .reverse()
  const past = allLessons.filter(
    l => new Date(l.scheduled_at) < now || l.status !== 'scheduled'
  )
  const upcomingSessions = allSessions
    .filter(s => new Date(s.scheduled_at) >= now && s.status === 'scheduled')
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
  const pastSessions = allSessions
    .filter(s => new Date(s.scheduled_at) < now || s.status !== 'scheduled')
    .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
  const sortedAssignments = allAssignments
    .slice()
    .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())

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
            <LessonList lessons={upcoming} />
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
            <LessonList lessons={past} />
          )}
        </CardContent>
      </Card>

      {/* Assignments */}
      {sortedAssignments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-amber-600" />
              Assignments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AssignmentList assignments={sortedAssignments} />
          </CardContent>
        </Card>
      )}

      {/* Classroom sessions — only shown to instructors who teach classes */}
      {allSessions.length > 0 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-purple-600" />
                Upcoming Classes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcomingSessions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No upcoming classes.
                </p>
              ) : (
                <SessionList sessions={upcomingSessions} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-purple-600" />
                Past Classes (Last 30 Days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pastSessions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No past classes.
                </p>
              ) : (
                <SessionList sessions={pastSessions} />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function AssignmentList({ assignments }: { assignments: InstructorAssignment[] }) {
  return (
    <div className="space-y-3">
      {assignments.map(a => {
        const start = new Date(a.scheduled_at)
        const h = Math.floor(a.duration_minutes / 60)
        const m = a.duration_minutes % 60
        const dur = h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`
        return (
          <div key={a.id} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-sm flex items-center gap-1.5">
                  <ClipboardList className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  {a.detail || 'Assignment'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {format(start, 'MMM d, yyyy')} · {format(start, 'h:mm a')}
                  <span className="mx-1.5">·</span>
                  {dur}
                </p>
              </div>
              <Badge variant={a.status === 'scheduled' ? 'default' : a.status === 'completed' ? 'secondary' : 'outline'} className="shrink-0">
                {a.status}
              </Badge>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SessionList({ sessions }: { sessions: ClassroomSessionWithRelations[] }) {
  return (
    <div className="space-y-3">
      {sessions.map(session => {
        const start = new Date(session.scheduled_at)
        const enrolled = session.attendance?.length ?? 0

        return (
          <div key={session.id} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-sm flex items-center gap-1.5">
                  <GraduationCap className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                  {session.topic}
                </p>
                <p className="text-sm text-muted-foreground">
                  {format(start, 'MMM d, yyyy')} · {format(start, 'h:mm a')}
                  <span className="mx-1.5">·</span>
                  {session.duration_minutes} min
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Users className="h-3 w-3 shrink-0" />
                  {enrolled}/{session.capacity} enrolled
                </p>
              </div>
              <Badge variant={session.status === 'scheduled' ? 'default' : session.status === 'completed' ? 'secondary' : 'outline'} className="shrink-0">
                {session.status}
              </Badge>
            </div>

            {session.location && (
              <div className="text-xs text-muted-foreground pt-1 border-t">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(session.location)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  <MapPin className="h-3 w-3 shrink-0" />
                  {session.location}
                </a>
              </div>
            )}

            {session.notes && (
              <div className="text-xs text-muted-foreground pt-1 border-t">
                <span className="font-medium">Notes:</span> {session.notes}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function LessonList({ lessons }: { lessons: LessonWithRelations[] }) {
  return (
    <div className="space-y-3">
      {lessons.map(lesson => {
        const start = new Date(lesson.scheduled_at)
        const hasNotes = lesson.notes_covered || lesson.notes_practice || lesson.notes_additional

        return (
          <div key={lesson.id} className="border rounded-lg p-3 space-y-2">
            {/* Top row: date, student, status */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-sm">
                  {format(start, 'MMM d, yyyy')} · {format(start, 'h:mm a')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {lesson.student.user.first_name} {lesson.student.user.last_name}
                  <span className="mx-1.5">·</span>
                  {lesson.duration_minutes} min
                </p>
                {lesson.vehicle && (
                  <p className="text-xs text-muted-foreground">
                    {lesson.vehicle.year} {lesson.vehicle.make} {lesson.vehicle.model}
                  </p>
                )}
              </div>
              <Badge variant={STATUS_BADGE[lesson.status]} className="shrink-0">
                {lesson.status.replace('_', ' ')}
              </Badge>
            </div>

            {/* Locations */}
            {(lesson.pickup_location || lesson.dropoff_location) && (
              <div className="text-xs text-muted-foreground space-y-0.5 pt-1 border-t">
                {lesson.pickup_location && (
                  <p>
                    <span className="font-medium">Pickup:</span>{' '}
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lesson.pickup_location)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {lesson.pickup_location}
                    </a>
                  </p>
                )}
                {lesson.dropoff_location && (
                  <p>
                    <span className="font-medium">Dropoff:</span>{' '}
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lesson.dropoff_location)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {lesson.dropoff_location}
                    </a>
                  </p>
                )}
              </div>
            )}

            {/* Notes */}
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

            {/* Actions */}
            {lesson.status === 'scheduled' && (
              <div className="pt-1">
                <LessonActions
                  lessonId={lesson.id}
                  status={lesson.status}
                  existingNotesCovered={lesson.notes_covered}
                  existingNotesPractice={lesson.notes_practice}
                  existingNotesAdditional={lesson.notes_additional}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
