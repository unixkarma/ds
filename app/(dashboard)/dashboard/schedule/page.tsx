// Schedule page — weekly calendar view with lesson booking

import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import {
  getLessonsForRange,
  getOpeningsForRange,
  getBookingFormData,
  getWeekStart,
  getWeekEnd,
} from '@/lib/services/schedule'
import { ScheduleClient } from '@/components/schedule/schedule-client'

async function ScheduleContent() {
  const weekStart = getWeekStart(new Date())
  const weekEnd = getWeekEnd(weekStart)

  const [lessons, openings, formData] = await Promise.all([
    getLessonsForRange(weekStart, weekEnd),
    getOpeningsForRange(weekStart, weekEnd),
    getBookingFormData(),
  ])

  return (
    <ScheduleClient
      initialLessons={lessons}
      initialOpenings={openings}
      initialWeekStart={weekStart.toISOString()}
      students={formData.students}
      instructors={formData.instructors}
      vehicles={formData.vehicles}
    />
  )
}

function ScheduleSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-32" />
      </div>
      <Skeleton className="h-[600px] w-full rounded-lg" />
    </div>
  )
}

export default function SchedulePage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Schedule</h1>
        <p className="text-muted-foreground text-sm mt-1">
          View and manage lessons across the week.
        </p>
      </div>
      <Suspense fallback={<ScheduleSkeleton />}>
        <ScheduleContent />
      </Suspense>
    </div>
  )
}
