import { notFound, redirect } from 'next/navigation'
import { format } from 'date-fns'

import { createClient } from '@/lib/supabase/server'
import { getClassroomSessionById } from '@/lib/services/classroom'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AttendanceRoster } from '@/components/classroom/attendance-roster'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function InstructorClassroomDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: instructor } = await supabase
    .from('instructors')
    .select('id')
    .eq('user_id', user.id)
    .single()
  if (!instructor) redirect('/instructor')

  const session = await getClassroomSessionById(id)
  if (!session) notFound()

  if (session.instructor_id !== (instructor as { id: string }).id) {
    // RLS would have hidden it, but defense in depth.
    notFound()
  }

  const start = new Date(session.scheduled_at)
  const canEdit = session.status === 'scheduled'

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">
            {session.topic || 'Classroom session'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {format(start, 'EEEE, MMM d, yyyy')} · {format(start, 'h:mm a')} ·{' '}
            {session.duration_minutes} min
            {session.location && (
              <>
                <span className="mx-1.5">·</span>
                {session.location}
              </>
            )}
          </p>
        </div>
        <Badge variant={session.status === 'cancelled' ? 'outline' : 'default'}>
          {session.status}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Attendance ({session.attendance.length}/{session.capacity})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AttendanceRoster
            sessionId={session.id}
            roster={session.attendance}
            canEdit={canEdit}
            canUnenroll={false}
          />
        </CardContent>
      </Card>

      {session.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{session.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
