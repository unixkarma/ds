import { redirect } from 'next/navigation'

import { getInstructorPortalData } from '@/lib/services/instructor-portal'
import { AvailabilityForm } from '@/components/instructors/availability-form'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { DAY_LABELS, formatTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

// Days ordered Mon–Sun: 1,2,3,4,5,6,0
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

export default async function InstructorAvailabilityPage() {
  const data = await getInstructorPortalData()
  if (!data) redirect('/login')

  const { instructor } = data
  const availability = instructor.availability ?? []

  // Group by day and sort
  const byDay = new Map<number, { start_time: string; end_time: string }[]>()
  for (const slot of availability) {
    const existing = byDay.get(slot.day_of_week) ?? []
    existing.push({ start_time: slot.start_time, end_time: slot.end_time })
    byDay.set(slot.day_of_week, existing)
  }
  // Sort blocks within each day
  for (const blocks of byDay.values()) {
    blocks.sort((a, b) => a.start_time.localeCompare(b.start_time))
  }

  const activeDays = DAY_ORDER.filter(d => byDay.has(d))

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Availability</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Set your weekly availability so students can book lessons during your open hours.
          Add multiple time blocks per day to create breaks (e.g., lunch).
        </p>
      </div>

      {/* Current availability summary */}
      {activeDays.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current Schedule</CardTitle>
            <CardDescription>
              Your active weekly time slots
              {instructor.buffer_minutes > 0 && (
                <span> · {instructor.buffer_minutes} min buffer between lessons</span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {activeDays.map(dayNum => {
                const blocks = byDay.get(dayNum)!
                return (
                  <div key={dayNum} className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium w-20">{DAY_LABELS[dayNum]}</span>
                    {blocks.map((block, i) => (
                      <Badge key={i} variant="secondary" className="text-sm py-1 px-3">
                        {formatTime(block.start_time)} – {formatTime(block.end_time)}
                      </Badge>
                    ))}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Edit Availability</CardTitle>
          <CardDescription>
            Toggle days on/off, set your time blocks, and add breaks between them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AvailabilityForm
            instructorId={instructor.id}
            existing={availability}
            currentBufferMinutes={instructor.buffer_minutes}
          />
        </CardContent>
      </Card>
    </div>
  )
}
