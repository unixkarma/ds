import { redirect } from 'next/navigation'
import { format } from 'date-fns'
import { GraduationCap } from 'lucide-react'

import { getStudentClassroomData } from '@/lib/services/student-portal'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type {
  ClassroomSessionWithRelations,
  ClassroomAttendanceStatus,
} from '@/types'

const ATTENDANCE_LABEL: Record<ClassroomAttendanceStatus, string> = {
  enrolled: 'Enrolled',
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  excused: 'Excused',
}

const ATTENDANCE_VARIANT: Record<
  ClassroomAttendanceStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  enrolled: 'outline',
  present: 'default',
  late: 'secondary',
  absent: 'destructive',
  excused: 'secondary',
}

export default async function StudentClassroomPage() {
  const data = await getStudentClassroomData()
  if (!data) redirect('/login')

  const { upcoming, past, totalRequired, totalAttended } = data
  const remaining = Math.max(totalRequired - totalAttended, 0)
  const hasAny = upcoming.length > 0 || past.length > 0 || totalRequired > 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Classroom</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your group classroom sessions and attendance.
        </p>
      </div>

      {totalRequired > 0 && (
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-4">
              <GraduationCap className="h-6 w-6 text-blue-500 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">Classroom Progress</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {totalAttended} of {totalRequired} classes attended
                  {remaining > 0 && ` · ${remaining} remaining`}
                </p>
              </div>
              <div className="text-2xl font-bold tabular-nums shrink-0">
                {totalAttended}/{totalRequired}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!hasAny && (
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <GraduationCap className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              You have no classroom sessions yet.
            </p>
          </CardContent>
        </Card>
      )}

      {upcoming.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upcoming sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {upcoming.map(session => (
                <SessionRow key={session.id} session={session} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {past.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Past sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {past.map(session => (
                <SessionRow key={session.id} session={session} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function SessionRow({ session }: { session: ClassroomSessionWithRelations }) {
  const start = new Date(session.scheduled_at)
  const end = new Date(start.getTime() + session.duration_minutes * 60 * 1000)
  // RLS only returns this student's own attendance row.
  const myAttendance = session.attendance?.[0]
  const status: ClassroomAttendanceStatus = myAttendance?.status ?? 'enrolled'
  const instructorName = session.instructor
    ? `${session.instructor.user.first_name} ${session.instructor.user.last_name}`.trim()
    : 'Unassigned'

  return (
    <div className="flex items-start gap-4 rounded-lg border p-3">
      <div className="flex-none text-center w-12">
        <div className="text-xs font-medium text-muted-foreground uppercase">
          {format(start, 'MMM')}
        </div>
        <div className="text-2xl font-bold leading-none">{format(start, 'd')}</div>
        <div className="text-xs text-muted-foreground">{format(start, 'EEE')}</div>
      </div>

      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-sm font-medium">
          {format(start, 'h:mm a')} – {format(end, 'h:mm a')}
        </p>
        <p className="text-sm text-muted-foreground">
          {session.topic || 'Classroom session'}
          <span className="mx-1.5">·</span>
          {session.duration_minutes} min
        </p>
        <p className="text-xs text-muted-foreground">
          with {instructorName}
          {session.location && (
            <>
              <span className="mx-1.5">·</span>
              {session.location}
            </>
          )}
        </p>
      </div>

      <div className="flex flex-col items-end gap-1 shrink-0">
        {session.status === 'cancelled' ? (
          <Badge variant="outline">Cancelled</Badge>
        ) : (
          <Badge
            variant={ATTENDANCE_VARIANT[status]}
            className={cn(status === 'late' && 'bg-amber-500 text-white hover:bg-amber-500')}
          >
            {ATTENDANCE_LABEL[status]}
          </Badge>
        )}
      </div>
    </div>
  )
}
