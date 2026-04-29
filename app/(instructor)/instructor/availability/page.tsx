import { redirect } from 'next/navigation'

import { getInstructorScheduleData } from '@/lib/services/instructor-schedule'
import { ScheduleClient } from '@/components/openings/schedule-client'

export default async function InstructorAvailabilityPage() {
  const data = await getInstructorScheduleData()
  if (!data) redirect('/login')

  return (
    <ScheduleClient
      instructorId={data.instructorId}
      bufferMinutes={data.bufferMinutes}
      schoolDefaults={data.schoolDefaults}
      ownTemplates={data.ownTemplates}
      daysOff={data.daysOff}
      upcomingOpenings={data.upcomingOpenings}
    />
  )
}
