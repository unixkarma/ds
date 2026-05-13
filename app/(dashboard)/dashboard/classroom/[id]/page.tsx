import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { format } from 'date-fns'

import { getClassroomSessionById } from '@/lib/services/classroom'
import { getInstructors } from '@/lib/services/instructors'
import { getStudents } from '@/lib/services/students'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ClassroomSessionForm } from '@/components/classroom/classroom-session-form'
import { AttendanceRoster } from '@/components/classroom/attendance-roster'
import { EnrollStudentsDialog } from '@/components/classroom/enroll-students-dialog'
import { CancelSessionButton } from './cancel-session-button'

export const metadata: Metadata = { title: 'Classroom session' }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ClassroomSessionPage({ params }: PageProps) {
  const { id } = await params
  const session = await getClassroomSessionById(id)
  if (!session) notFound()

  const [instructors, students] = await Promise.all([getInstructors(), getStudents()])

  const start = new Date(session.scheduled_at)
  const enrolledIds = session.attendance.map((r) => r.student_id)
  const seatsLeft = Math.max(0, session.capacity - session.attendance.length)

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">
            {session.topic || 'Classroom session'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {format(start, 'EEEE, MMM d, yyyy')} · {format(start, 'h:mm a')} ·{' '}
            {session.duration_minutes} min
          </p>
        </div>
        <Badge variant={session.status === 'cancelled' ? 'outline' : 'default'}>
          {session.status}
        </Badge>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            Roster ({session.attendance.length}/{session.capacity})
          </CardTitle>
          {session.status !== 'cancelled' && seatsLeft > 0 && (
            <EnrollStudentsDialog
              sessionId={session.id}
              students={students.filter((s) => s.status === 'active')}
              alreadyEnrolledIds={enrolledIds}
              capacity={session.capacity}
            />
          )}
        </CardHeader>
        <CardContent>
          <AttendanceRoster
            sessionId={session.id}
            roster={session.attendance}
            canUnenroll
            canEdit={session.status !== 'cancelled'}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Session details</CardTitle>
        </CardHeader>
        <CardContent>
          <ClassroomSessionForm
            mode="edit"
            instructors={instructors}
            session={session}
          />
        </CardContent>
      </Card>

      {session.status !== 'cancelled' && (
        <>
          <Separator />
          <CancelSessionButton sessionId={session.id} />
        </>
      )}
    </div>
  )
}
