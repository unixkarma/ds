'use client'

import { useState, useMemo } from 'react'
import { parseISO, startOfMonth, endOfMonth, startOfDay, endOfDay, format } from 'date-fns'
import { DollarSign, Users, Receipt, Download } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getFullName } from '@/lib/utils'
import { toCSV, downloadCSV, type CSVColumn } from '@/lib/csv'
import type { InstructorWithUser, LessonWithRelations } from '@/types'

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

interface InstructorPayrollReportProps {
  instructors: InstructorWithUser[]
  lessons: LessonWithRelations[]
}

export function InstructorPayrollReport({ instructors, lessons }: InstructorPayrollReportProps) {
  // Default to the current month, but allow any custom date range.
  const now = new Date()
  const [startDate, setStartDate] = useState(format(startOfMonth(now), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(endOfMonth(now), 'yyyy-MM-dd'))

  const periodStart = startOfDay(parseISO(startDate))
  const periodEnd = endOfDay(parseISO(endDate))
  const periodLabel = `${format(periodStart, 'MMM d, yyyy')} – ${format(periodEnd, 'MMM d, yyyy')}`

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
        const cancelledLessons = instructorLessons.filter(l => l.status === 'cancelled')
        const noShowLessons = instructorLessons.filter(l => l.status === 'no_show')
        const cancelledByInstructor = cancelledLessons.filter(
          l => l.cancelled_by === 'instructor'
        )

        const completedCount = completedLessons.length
        const cancelledCount = cancelledLessons.length
        const noShowCount = noShowLessons.length
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
          cancelledCount,
          noShowCount,
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
        cancelled: acc.cancelled + p.cancelledCount,
        noShow: acc.noShow + p.noShowCount,
        hours: acc.hours + p.totalHours,
        gross: acc.gross + p.grossEarnings,
        commission: acc.commission + p.commissionCollected,
        vehicle: acc.vehicle + p.vehicleDeduction,
        cancelFees: acc.cancelFees + p.cancelFees,
        net: acc.net + p.netPayable,
      }),
      { lessons: 0, cancelled: 0, noShow: 0, hours: 0, gross: 0, commission: 0, vehicle: 0, cancelFees: 0, net: 0 }
    )
  }, [payroll])

  // Student cancel fees (revenue for MDA)
  const studentCancelRevenue = useMemo(() => {
    return filteredLessons
      .filter(l => l.status === 'cancelled' && l.cancelled_by === 'student')
      .reduce((sum, l) => sum + l.cancellation_fee_cents, 0)
  }, [filteredLessons])

  // No-show fees charged to students (revenue for MDA)
  const noShowRevenue = useMemo(() => {
    return filteredLessons
      .filter(l => l.status === 'no_show')
      .reduce((sum, l) => sum + (l.no_show_fee_cents ?? 0), 0)
  }, [filteredLessons])

  // School-sold lesson revenue (total price - instructor earnings)
  const schoolSoldRevenue = useMemo(() => {
    return filteredLessons
      .filter(l => l.status === 'completed' && l.sold_by === 'school')
      .reduce((sum, l) => sum + (l.price_cents - l.instructor_earning_cents), 0)
  }, [filteredLessons])

  const handleExport = () => {
    type Row = (typeof payroll)[number]
    const columns: CSVColumn<Row>[] = [
      { header: 'Instructor', value: r => getFullName(r.instructor.user) },
      { header: 'Modality', value: r => r.instructor.modality },
      { header: 'Completed', value: r => r.completedCount },
      { header: 'Cancelled', value: r => r.cancelledCount },
      { header: 'No-show', value: r => r.noShowCount },
      { header: 'Hours', value: r => r.totalHours.toFixed(2) },
      { header: 'Gross', value: r => (r.grossEarnings / 100).toFixed(2) },
      { header: 'Commission', value: r => (r.commissionCollected / 100).toFixed(2) },
      { header: 'Vehicle Deduction', value: r => (r.vehicleDeduction / 100).toFixed(2) },
      { header: 'Cancel Fees', value: r => (r.cancelFees / 100).toFixed(2) },
      { header: 'Net Payable', value: r => (r.netPayable / 100).toFixed(2) },
    ]
    const csv = toCSV(payroll, columns)
    downloadCSV(`payroll-${startDate}_to_${endDate}.csv`, csv)
  }

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">From</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="h-9 px-3 rounded-md border border-input bg-background text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">To</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="h-9 px-3 rounded-md border border-input bg-background text-sm"
            />
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={payroll.length === 0}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
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
              {dollars(totals.commission + totals.vehicle + totals.cancelFees + schoolSoldRevenue + studentCancelRevenue + noShowRevenue)}
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
                <TableHead className="text-center">Completed</TableHead>
                <TableHead className="text-center">Cancelled</TableHead>
                <TableHead className="text-center">No-show</TableHead>
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
                instructor, completedCount, cancelledCount, noShowCount, totalHours,
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
                  <TableCell className="text-center text-muted-foreground">{cancelledCount}</TableCell>
                  <TableCell className="text-center text-muted-foreground">{noShowCount}</TableCell>
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
                <TableCell className="text-center">{totals.cancelled}</TableCell>
                <TableCell className="text-center">{totals.noShow}</TableCell>
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
            <div className="flex justify-between">
              <span className="text-muted-foreground">No-show fees</span>
              <span className="font-medium">{dollars(noShowRevenue)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 font-semibold">
              <span>Total MDA Revenue</span>
              <span>
                {dollars(totals.commission + schoolSoldRevenue + totals.vehicle + totals.cancelFees + studentCancelRevenue + noShowRevenue)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
