import Link from 'next/link'
import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import type { ClassroomSessionWithRelations, ClassroomSessionStatus } from '@/types'

const STATUS_VARIANT: Record<ClassroomSessionStatus, 'default' | 'secondary' | 'outline'> = {
  scheduled: 'default',
  completed: 'secondary',
  cancelled: 'outline',
}

interface ClassroomSessionCardProps {
  session: ClassroomSessionWithRelations
  href: string
}

export function ClassroomSessionCard({ session, href }: ClassroomSessionCardProps) {
  const start = new Date(session.scheduled_at)
  const enrolled = session.attendance?.length ?? 0
  const attended = (session.attendance ?? []).filter(
    (r) => r.status === 'present' || r.status === 'late'
  ).length
  const instructorName = session.instructor
    ? `${session.instructor.user.first_name} ${session.instructor.user.last_name}`.trim()
    : 'Unassigned'

  return (
    <Link
      href={href}
      className="block border rounded-lg p-3 space-y-2 hover:bg-muted/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-sm">
            {format(start, 'MMM d, yyyy')} · {format(start, 'h:mm a')}
          </p>
          <p className="text-sm text-muted-foreground">
            {session.topic || 'Classroom session'}
            <span className="mx-1.5">·</span>
            {session.duration_minutes} min
          </p>
          <p className="text-xs text-muted-foreground">
            {instructorName}
            {session.location && (
              <>
                <span className="mx-1.5">·</span>
                {session.location}
              </>
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge variant={STATUS_VARIANT[session.status]}>{session.status}</Badge>
          <span className="text-xs text-muted-foreground">
            {enrolled}/{session.capacity} enrolled
            {attended > 0 && ` · ${attended} attended`}
          </span>
        </div>
      </div>
    </Link>
  )
}
