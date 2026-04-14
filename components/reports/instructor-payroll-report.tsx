'use client'

import { useState, useMemo } from 'react'
import { parseISO, startOfMonth, endOfMonth, format } from 'date-fns'
import { DollarSign, Users, Receipt } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getFullName } from '@/lib/utils'
import type { InstructorWithUser, LessonWithRelations } from '@/types'

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

interface InstructorPayrollReportProps {
  instructors: InstructorWithUser[]
  lessons: LessonWithRelations[]
}

export function InstructorPayrollReport({ instructors, lessons }: InstructorPayrollReportProps) {
  // Default to current month
  const now = new Date()
  const [month, setMonth] = useState(format(now, 'yyyy-MM'))

  const periodStart = startOfMonth(parseISO(`${month}-01`))
  const periodEnd = endOfMonth(periodStart)
  const periodLabel = format(periodStart, 'MMMM yyyy')

  const filteredLessons = useMemo(() => {
    return lessons.filter(lesson => {
      const date = parseISO(lesson.scheduled_at)
      return date >= periodStart && date <= periodEnd
    })
  }, [lessons, periodStart, periodEnd])

  const payroll = useMemo(() => {
    return instructors
      .filter(i => i.is_active)
      .map(instructor => {
        const instructorLessons = filteredLessons.filter(
          l => l.instructor_id === instructor.id
        )

        const completedLessons = instructorLessons.filter(l => l.status === 'completed')
        const cancelledByInstructor = instructorLessons.filter(
          l => l.status === 'cancelled' && l.cancelled_by === 'instructor'
        )

        const completedCount = completedLessons.length
        const totalMinutes = completedLessons.reduce((sum, l) => sum + l.duration_minutes, 0)
        const totalHours = totalMinutes / 60

        const grossEarnings = completedLessons.reduce(
          (sum, l) => sum + l.instructor_earning_cents, 0
        )

        const commissionCollected = completedLessons
          .filter(l => l.sold_by === 'instructor')
          .reduce((sum, l) => sum + (l.price_cents - l.instructor_earning_cents), 0)

        const cancelFees = cancelledByInstructor.reduce(
          (sum, l) => sum + l.cancellation_fee_cents, 0
        )

        const vehicleDeduction = instructor.uses_school_vehicle
          ? instructor.vehicle_monthly_fee_cents
          : 0

        const netPayable = grossEarnings - vehicleDeduction - cancelFees

        return {
          instructor,
          completedCount,
          totalHours,
          grossEarnings,
          commissionCollected,
          vehicleDeduction,
          cancelFees,
          netPayable,
        }
      })
      .sort((a, b) => b.grossEarnings - a.grossEarnings)
  }, [instructors, filteredLessons])

  const totals = useMemo(() => {
    return payroll.reduce(
      (acc, p) => ({
        lessons: acc.lessons + p.completedCount,
        hours: acc.hours + p.totalHours,
        gross: acc.gross + p.grossEarnings,
        commission: acc.commission + p.commissionCollected,
        vehicle: acc.vehicle + p.vehicleDeduction,
        cancelFees: acc.cancelFees + p.cancelFees,
        net: acc.net + p.netPayable,
      }),
      { lessons: 0, hours: 0, gross: 0, commission: 0, vehicle: 0, cancelFees: 0, net: 0 }
    )
  }, [payroll])

  // Student cancel fees (revenue for MDA)
  const studentCancelRevenue = useMemo(() => {
    return filteredLessons
      .filter(l => l.status === 'cancelled' && l.cancelled_by === 'student')
      .reduce((sum, l) => sum + l.cancellation_fee_cents, 0)
  }, [filteredLessons])

  // School-sold lesson revenue (total price - instructor earnings)
  const schoolSoldRevenue = useMemo(() => {
    return filteredLessons
      .filter(l => l.status === 'completed' && l.sold_by === 'school')
      .reduce((sum, l) => sum + (l.price_cents - l.instructor_earning_cents), 0)
  }, [filteredLessons])

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">Month</label>
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="h-9 px-3 rounded-md border border-input bg-background text-sm"
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Net Payable to Instructors
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{dollars(totals.net)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {totals.lessons} lessons / {totals.hours.toFixed(1)}h
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              MDA Commission Collected
            </CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{dollars(totals.commission)}</p>
            <p className="text-xs text-muted-foreground mt-1">From independent sales</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              MDA Total Revenue
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {dollars(totals.commission + totals.vehicle + totals.cancelFees + schoolSoldRevenue + studentCancelRevenue)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Commission + vehicles + fees + school sales
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Payroll table */}
      {payroll.length === 0 ? (
        <div className="flex items-center justify-center py-16 border rounded-lg">
          <p className="text-sm text-muted-foreground">No active instructors.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Instructor</TableHead>
                <TableHead className="text-center">Modality</TableHead>
                <TableHead className="text-center">Lessons</TableHead>
                <TableHead className="text-center">Hours</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Commission</TableHead>
                <TableHead className="text-right">Vehicle</TableHead>
                <TableHead className="text-right">Cancel Fees</TableHead>
                <TableHead className="text-right">Net Payable</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payroll.map(({
                instructor, completedCount, totalHours,
                grossEarnings, commissionCollected, vehicleDeduction,
                cancelFees, netPayable,
              }) => (
                <TableRow key={instructor.id}>
                  <TableCell className="font-medium">
                    {getFullName(instructor.user)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={instructor.modality === 'independent' ? 'default' : 'secondary'}>
                      {instructor.modality === 'independent' ? 'Independent' : 'School'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">{completedCount}</TableCell>
                  <TableCell className="text-center">{totalHours.toFixed(1)}</TableCell>
                  <TableCell className="text-right">{dollars(grossEarnings)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {commissionCollected > 0 ? dollars(commissionCollected) : '—'}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {vehicleDeduction > 0 ? `-${dollars(vehicleDeduction)}` : '—'}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {cancelFees > 0 ? `-${dollars(cancelFees)}` : '—'}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {dollars(netPayable)}
                  </TableCell>
                </TableRow>
              ))}

              {/* Totals row */}
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell>Total</TableCell>
                <TableCell />
                <TableCell className="text-center">{totals.lessons}</TableCell>
                <TableCell className="text-center">{totals.hours.toFixed(1)}</TableCell>
                <TableCell className="text-right">{dollars(totals.gross)}</TableCell>
                <TableCell className="text-right">
                  {totals.commission > 0 ? dollars(totals.commission) : '—'}
                </TableCell>
                <TableCell className="text-right">
                  {totals.vehicle > 0 ? `-${dollars(totals.vehicle)}` : '—'}
                </TableCell>
                <TableCell className="text-right">
                  {totals.cancelFees > 0 ? `-${dollars(totals.cancelFees)}` : '—'}
                </TableCell>
                <TableCell className="text-right">{dollars(totals.net)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}

      {/* MDA Revenue breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">MDA Revenue Breakdown — {periodLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Commission from independent sales</span>
              <span className="font-medium">{dollars(totals.commission)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">School-sold lesson margin</span>
              <span className="font-medium">{dollars(schoolSoldRevenue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Vehicle fees collected</span>
              <span className="font-medium">{dollars(totals.vehicle)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Instructor cancellation fees</span>
              <span className="font-medium">{dollars(totals.cancelFees)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Student cancellation fees</span>
              <span className="font-medium">{dollars(studentCancelRevenue)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 font-semibold">
              <span>Total MDA Revenue</span>
              <span>
                {dollars(totals.commission + schoolSoldRevenue + totals.vehicle + totals.cancelFees + studentCancelRevenue)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
