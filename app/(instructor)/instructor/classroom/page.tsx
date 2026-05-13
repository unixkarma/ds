import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { getInstructorClassroomSessions } from '@/lib/services/classroom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ClassroomSessionCard } from '@/components/classroom/classroom-session-card'

export default async function InstructorClassroomPage() {
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

  const sessions = await getInstructorClassroomSessions((instructor as { id: string }).id)

  const now = new Date()
  const upcoming = sessions
    .filter((s) => new Date(s.scheduled_at) >= now && s.status === 'scheduled')
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
  const past = sessions.filter(
    (s) => new Date(s.scheduled_at) < now || s.status !== 'scheduled'
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Classroom</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your assigned group sessions. Mark attendance on each.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upcoming sessions</CardTitle>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No upcoming sessions.
            </p>
          ) : (
            <div className="space-y-3">
              {upcoming.map((s) => (
                <ClassroomSessionCard
                  key={s.id}
                  session={s}
                  href={`/instructor/classroom/${s.id}`}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Past & cancelled</CardTitle>
        </CardHeader>
        <CardContent>
          {past.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No past sessions.
            </p>
          ) : (
            <div className="space-y-3">
              {past.map((s) => (
                <ClassroomSessionCard
                  key={s.id}
                  session={s}
                  href={`/instructor/classroom/${s.id}`}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
