import { redirect } from 'next/navigation'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'

import { getInstructorEarningsData } from '@/lib/services/instructor-portal'
import { EarningsClient } from '@/components/instructor/earnings-client'

interface EarningsPageProps {
  searchParams: Promise<{ period?: string }>
}

export default async function InstructorEarningsPage({ searchParams }: EarningsPageProps) {
  const { period } = await searchParams

  // Determine period bounds
  let periodStart: Date
  let periodEnd: Date
  let periodLabel: string

  const now = new Date()

  switch (period) {
    case 'last-month': {
      const last = subMonths(now, 1)
      periodStart = startOfMonth(last)
      periodEnd = endOfMonth(last)
      periodLabel = format(periodStart, 'MMMM yyyy')
      break
    }
    case 'this-month':
    default: {
      periodStart = startOfMonth(now)
      periodEnd = endOfMonth(now)
      periodLabel = format(periodStart, 'MMMM yyyy')
      break
    }
  }

  const data = await getInstructorEarningsData(
    periodStart.toISOString(),
    periodEnd.toISOString(),
  )

  if (!data) redirect('/login')

  const { instructor, lessons, cancelledLessons } = data

  // Calculate summary stats
  const totalLessons = lessons.length
  const totalMinutes = lessons.reduce((sum, l) => sum + l.duration_minutes, 0)
  const totalHours = totalMinutes / 60
  const grossEarnings = lessons.reduce((sum, l) => sum + l.instructor_earning_cents, 0)

  // Commission paid to MDA (only for independent + instructor-sold)
  const commissionTotal = lessons
    .filter(l => l.sold_by === 'instructor')
    .reduce((sum, l) => sum + (l.price_cents - l.instructor_earning_cents), 0)

  // Vehicle deduction
  const vehicleDeduction = instructor.uses_school_vehicle
    ? instructor.vehicle_monthly_fee_cents
    : 0

  // Cancellation fees (instructor cancelled)
  const cancelFeeTotal = cancelledLessons.reduce((sum, l) => sum + l.cancellation_fee_cents, 0)

  const netEarnings = grossEarnings - vehicleDeduction - cancelFeeTotal
  const taxReserve = Math.round(netEarnings * 0.15)
  const takeHome = netEarnings - taxReserve

  return (
    <EarningsClient
      periodLabel={periodLabel}
      currentPeriod={period ?? 'this-month'}
      totalLessons={totalLessons}
      totalHours={totalHours}
      grossEarnings={grossEarnings}
      commissionTotal={commissionTotal}
      vehicleDeduction={vehicleDeduction}
      cancelFeeTotal={cancelFeeTotal}
      cancelledCount={cancelledLessons.length}
      netEarnings={netEarnings}
      taxReserve={taxReserve}
      takeHome={takeHome}
      lessons={lessons}
      modality={instructor.modality}
      usesSchoolVehicle={instructor.uses_school_vehicle}
    />
  )
}
