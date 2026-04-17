import { redirect } from 'next/navigation'

import { getInstructorPortalData } from '@/lib/services/instructor-portal'
import { InstructorCalendar } from '@/components/instructor/instructor-calendar'

export default async function InstructorCalendarPage() {
  const data = await getInstructorPortalData()
  if (!data) redirect('/login')

  const { instructor } = data

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Calendar</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Weekly overview of your lessons, travel times, and locations.
        </p>
      </div>

      <InstructorCalendar
        instructorId={instructor.id}
        bufferMinutes={instructor.buffer_minutes}
      />
    </div>
  )
}
