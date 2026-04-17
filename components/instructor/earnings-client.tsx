'use client'

import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import {
  BookOpen,
  Clock,
  DollarSign,
  TrendingDown,
  Wallet,
  Timer,
} from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { EarningsLesson } from '@/lib/services/instructor-portal'

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

interface EarningsClientProps {
  periodLabel: string
  currentPeriod: string
  totalLessons: number
  totalHours: number
  grossEarnings: number
  commissionTotal: number
  vehicleDeduction: number
  cancelFeeTotal: number
  cancelledCount: number
  netEarnings: number
  taxReserve: number
  takeHome: number
  lessons: EarningsLesson[]
  modality: string
  usesSchoolVehicle: boolean
}

export function EarningsClient({
  periodLabel,
  currentPeriod,
  totalLessons,
  totalHours,
  grossEarnings,
  commissionTotal,
  vehicleDeduction,
  cancelFeeTotal,
  cancelledCount,
  netEarnings,
  taxReserve,
  takeHome,
  lessons,
  modality,
  usesSchoolVehicle,
}: EarningsClientProps) {
  const router = useRouter()

  function handlePeriodChange(value: string) {
    router.push(`/instructor/earnings?period=${value}`)
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Earnings</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track your completed lessons and earnings.
          </p>
        </div>

        <Select value={currentPeriod} onValueChange={handlePeriodChange}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="this-month">This Month</SelectItem>
            <SelectItem value="last-month">Last Month</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          icon={BookOpen}
          label="Lessons"
          value={String(totalLessons)}
          iconClass="text-blue-500"
        />
        <StatCard
          icon={Clock}
          label="Hours"
          value={totalHours.toFixed(1)}
          iconClass="text-amber-500"
        />
        <StatCard
          icon={DollarSign}
          label="Gross"
          value={dollars(grossEarnings)}
          iconClass="text-emerald-500"
        />
        <StatCard
          icon={TrendingDown}
          label="Deductions"
          value={dollars(vehicleDeduction + cancelFeeTotal + commissionTotal)}
          iconClass="text-red-500"
        />
        <StatCard
          icon={Wallet}
          label="Net"
          value={dollars(netEarnings)}
          iconClass="text-primary"
        />
        <StatCard
          icon={Timer}
          label="Avg $/hr"
          value={totalHours > 0 ? dollars(Math.round(grossEarnings / totalHours)) : '—'}
          iconClass="text-violet-500"
        />
      </div>

      {/* Completed lessons table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Completed Lessons — {periodLabel}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {lessons.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No completed lessons this period.
            </p>
          ) : (
            <div className="space-y-3">
              {lessons.map(lesson => (
                <div key={lesson.id} className="border rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm">
                        {format(new Date(lesson.scheduled_at), 'MMM d')} · {format(new Date(lesson.scheduled_at), 'h:mm a')}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {lesson.student_first_name} {lesson.student_last_name}
                        <span className="mx-1.5">·</span>
                        {lesson.duration_minutes} min
                      </p>
                    </div>
                    <Badge
                      variant={lesson.sold_by === 'instructor' ? 'default' : 'secondary'}
                      className="text-xs shrink-0"
                    >
                      {lesson.sold_by === 'instructor' ? 'My sale' : 'School'}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 pt-2 border-t text-sm">
                    <div>
                      <span className="text-muted-foreground">Price:</span>{' '}
                      <span>{dollars(lesson.price_cents)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Earned:</span>{' '}
                      <span className="font-medium text-emerald-600">{dollars(lesson.instructor_earning_cents)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">$/hr:</span>{' '}
                      <span className="font-medium text-violet-600">
                        {lesson.duration_minutes > 0
                          ? dollars(Math.round(lesson.instructor_earning_cents / (lesson.duration_minutes / 60)))
                          : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deductions & estimates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Deductions & Estimates</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            {modality === 'independent' && commissionTotal > 0 && (
              <Row label="MDA Commission" value={`-${dollars(commissionTotal)}`} muted />
            )}
            {usesSchoolVehicle && vehicleDeduction > 0 && (
              <Row
                label={`Vehicle fee (${periodLabel})`}
                value={`-${dollars(vehicleDeduction)}`}
                muted
              />
            )}
            {cancelFeeTotal > 0 && (
              <Row
                label={`Cancellation fees (${cancelledCount} cancelled)`}
                value={`-${dollars(cancelFeeTotal)}`}
                muted
              />
            )}

            <div className="border-t pt-3">
              <Row label="Net after deductions" value={dollars(netEarnings)} bold />
            </div>

            <div className="border-t pt-3 space-y-2">
              <Row
                label="Est. tax reserve (15% annual)"
                value={`~${dollars(taxReserve)}/mo`}
                muted
              />
              <Row
                label="Suggested take-home"
                value={`~${dollars(takeHome)}`}
                bold
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  iconClass,
}: {
  icon: React.ElementType
  label: string
  value: string
  iconClass: string
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center gap-3">
          <Icon className={`h-5 w-5 ${iconClass} shrink-0`} />
          <div>
            <p className="text-xl font-bold leading-none">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function Row({
  label,
  value,
  bold,
  muted,
}: {
  label: string
  value: string
  bold?: boolean
  muted?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={muted ? 'text-muted-foreground' : ''}>{label}</span>
      <span className={bold ? 'font-semibold' : 'font-medium'}>{value}</span>
    </div>
  )
}
