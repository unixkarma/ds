import type { Metadata } from 'next'
import { getDaysOffRequests } from '@/lib/services/days-off'
import { DaysOffTable } from '@/components/time-off/days-off-table'

export const metadata: Metadata = { title: 'Time Off' }

export default async function TimeOffPage() {
  const requests = await getDaysOffRequests()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Time Off</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review instructor day-off requests. A request only blocks the schedule once you approve it.
        </p>
      </div>

      <DaysOffTable requests={requests} />
    </div>
  )
}
