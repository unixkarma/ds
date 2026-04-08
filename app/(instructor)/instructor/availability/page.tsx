import { redirect } from 'next/navigation'

import { getInstructorPortalData } from '@/lib/services/instructor-portal'
import { AvailabilityForm } from '@/components/instructors/availability-form'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { DAY_LABELS, formatTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export default async function InstructorAvailabilityPage() {
  const data = await getInstructorPortalData()
  if (!data) redirect('/login')

  const { instructor } = data
  const availability = instructor.availability ?? []

  // Sort availability by day_of_week for display
  const sorted = [...availability].sort((a, b) => {
    // Mon-Sun order: 1,2,3,4,5,6,0
    const order = (d: number) => (d === 0 ? 7 : d)
    return order(a.day_of_week) - order(b.day_of_week)
  })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Availability</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Set your weekly availability so students can book lessons during your open hours.
        </p>
      </div>

      {/* Current availability summary */}
      {sorted.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current Schedule</CardTitle>
            <CardDescription>Your active weekly time slots</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {sorted.map(slot => (
                <Badge key={slot.id} variant="secondary" className="text-sm py-1 px-3">
                  {DAY_LABELS[slot.day_of_week]}: {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Edit Availability</CardTitle>
          <CardDescription>
            Toggle days on/off and set your start and end times.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AvailabilityForm
            instructorId={instructor.id}
            existing={availability}
          />
        </CardContent>
      </Card>
    </div>
  )
}
