import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'

import { listClassroomSessions } from '@/lib/services/classroom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ClassroomSessionCard } from '@/components/classroom/classroom-session-card'

export const metadata: Metadata = { title: 'Classroom' }

export default async function ClassroomPage() {
  const sessions = await listClassroomSessions()

  const now = new Date()
  const upcoming = sessions
    .filter((s) => new Date(s.scheduled_at) >= now && s.status === 'scheduled')
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
  const past = sessions.filter(
    (s) => new Date(s.scheduled_at) < now || s.status !== 'scheduled'
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Classroom</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Group (in-room) sessions and attendance tracking
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/classroom/new">
            <Plus className="h-4 w-4 mr-1" />
            New session
          </Link>
        </Button>
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
                  href={`/dashboard/classroom/${s.id}`}
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
                  href={`/dashboard/classroom/${s.id}`}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
