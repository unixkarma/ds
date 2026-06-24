'use client'

import { useState, useMemo } from 'react'
import { parseISO, startOfMonth, endOfMonth, startOfDay, endOfDay, format } from 'date-fns'
import { DollarSign, Users, Receipt, Download, FileText } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import type {
  InstructorWithUser,
  LessonWithRelations,
  StudentPurchaseWithRelations,
  InstructorAssignmentWithInstructor,
  InstructorDeductionWithInstructor,
  InstructorReimbursementWithInstructor,
  LessonStatus,
  DeductionType,
  ReimbursementStatus,
} from '@/types'

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function fmtDate(iso: string | null): string {
  return iso ? format(parseISO(iso), 'MMM d, yyyy') : '—'
}

function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h}h`
  return `${m}m`
}

const DEDUCTION_LABEL: Record<DeductionType, string> = {
  car_insurance: 'Car insurance',
  personal_insurance: 'Personal insurance',
  other: 'Other',
}

const REIMBURSEMENT_BADGE: Record<ReimbursementStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline',
  approved: 'default',
  paid: 'secondary',
  rejected: 'destructive',
}

const LESSON_STATUS_BADGE: Record<LessonStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  scheduled: 'secondary',
  completed: 'default',
  cancelled: 'outline',
  no_show: 'destructive',
}

// Reimbursements only count toward pay once approved (or already paid).
function reimbursementCounts(status: ReimbursementStatus): boolean {
  return status === 'approved' || status === 'paid'
}

async function openEvidence(id: string) {
  const res = await fetch(`/api/reimbursements/${id}/evidence`)
  if (!res.ok) return
  const data = await res.json()
  if (data.url) window.open(data.url, '_blank', 'noopener,noreferrer')
}

interface InstructorPayrollReportProps {
  instructors: InstructorWithUser[]
  lessons: LessonWithRelations[]
  purchases: StudentPurchaseWithRelations[]
  assignments: InstructorAssignmentWithInstructor[]
  deductions: InstructorDeductionWithInstructor[]
  reimbursements: InstructorReimbursementWithInstructor[]
}

export function InstructorPayrollReport({
  instructors,
  lessons,
  purchases,
  assignments,
  deductions,
  reimbursements,
}: InstructorPayrollReportProps) {
  // Default to the current month, but allow any custom date range.
  const now = new Date()
  const [startDate, setStartDate] = useState(format(startOfMonth(now), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(endOfMonth(now), 'yyyy-MM-dd'))
  const [instructorId, setInstructorId] = useState<string>('all')

  const periodStart = startOfDay(parseISO(startDate))
  const periodEnd = endOfDay(parseISO(endDate))
  const periodLabel = `${format(periodStart, 'MMM d, yyyy')} – ${format(periodEnd, 'MMM d, yyyy')}`

  const inPeriod = (iso: string) => {
    const d = parseISO(iso)
    return d >= periodStart && d <= periodEnd
  }
  const matchInstructor = (id: string) => instructorId === 'all' || id === instructorId

  // Latest package bought per student (best-effort — lessons aren't linked to a
  // specific purchase, so we surface the student's most recent package).
  const packageByStudent = useMemo(() => {
    const map = new Map<string, string>()
    // purchases arrive newest-first; keep the first seen per student.
    for (const p of purchases) {
      if (!map.has(p.student_id)) map.set(p.student_id, p.package_name)
    }
    return map
  }, [purchases])

  const filteredLessons = useMemo(
    () => lessons.filter(l => inPeriod(l.scheduled_at) && matchInstructor(l.instructor_id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lessons, periodStart, periodEnd, instructorId]
  )
  const filteredAssignments = useMemo(
    () => assignments.filter(a => inPeriod(a.scheduled_at) && matchInstructor(a.instructor_id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assignments, periodStart, periodEnd, instructorId]
  )
  const filteredDeductions = useMemo(
    () => deductions.filter(d => inPeriod(d.date) && matchInstructor(d.instructor_id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deductions, periodStart, periodEnd, instructorId]
  )
  const filteredReimbursements = useMemo(
    () => reimbursements.filter(r => inPeriod(r.date) && matchInstructor(r.instructor_id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reimbursements, periodStart, periodEnd, instructorId]
  )

  // Lessons that belong on the detailed table (terminal states only).
  const detailLessons = useMemo(
    () => filteredLessons.filter(l => l.status !== 'scheduled'),
    [filteredLessons]
  )

  const payroll = useMemo(() => {
    return instructors
      .filter(i => i.is_active)
      .filter(i => matchInstructor(i.id))
      .map(instructor => {
        const instructorLessons = filteredLessons.filter(l => l.instructor_id === instructor.id)

        const completedLessons = instructorLessons.filter(l => l.status === 'completed')
        const cancelledLessons = instructorLessons.filter(l => l.status === 'cancelled')
        const noShowLessons = instructorLessons.filter(l => l.status === 'no_show')
        const cancelledByInstructor = cancelledLessons.filter(l => l.cancelled_by === 'instructor')

        const completedCount = completedLessons.length
        const cancelledCount = cancelledLessons.length
        const noShowCount = noShowLessons.length
        const totalMinutes = completedLessons.reduce((sum, l) => sum + l.duration_minutes, 0)
        const totalHours = totalMinutes / 60

        const grossEarnings = completedLessons.reduce((sum, l) => sum + l.instructor_earning_cents, 0)

        const commissionCollected = completedLessons
          .filter(l => l.sold_by === 'instructor')
          .reduce((sum, l) => sum + (l.price_cents - l.instructor_earning_cents), 0)

        const cancelFees = cancelledByInstructor.reduce((sum, l) => sum + l.cancellation_fee_cents, 0)

        const vehicleDeduction = instructor.uses_school_vehicle
          ? instructor.vehicle_monthly_fee_cents
          : 0

        // Payroll extras
        const assignmentEarnings = filteredAssignments
          .filter(a => a.instructor_id === instructor.id && a.status === 'completed')
          .reduce((sum, a) => sum + a.earning_cents, 0)

        const deductionTotal = filteredDeductions
          .filter(d => d.instructor_id === instructor.id)
          .reduce((sum, d) => sum + d.amount_cents, 0)

        const reimbursementTotal = filteredReimbursements
          .filter(r => r.instructor_id === instructor.id && reimbursementCounts(r.status))
          .reduce((sum, r) => sum + r.amount_cents, 0)

        const netPayable =
          grossEarnings +
          assignmentEarnings -
          vehicleDeduction -
          cancelFees -
          deductionTotal +
          reimbursementTotal

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
          assignmentEarnings,
          deductionTotal,
          reimbursementTotal,
          netPayable,
        }
      })
      .sort((a, b) => b.netPayable - a.netPayable)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instructors, filteredLessons, filteredAssignments, filteredDeductions, filteredReimbursements, instructorId])

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
        assignments: acc.assignments + p.assignmentEarnings,
        deductions: acc.deductions + p.deductionTotal,
        reimbursements: acc.reimbursements + p.reimbursementTotal,
        net: acc.net + p.netPayable,
      }),
      { lessons: 0, cancelled: 0, noShow: 0, hours: 0, gross: 0, commission: 0, vehicle: 0, cancelFees: 0, assignments: 0, deductions: 0, reimbursements: 0, net: 0 }
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
      { header: 'Assignments', value: r => (r.assignmentEarnings / 100).toFixed(2) },
      { header: 'Commission', value: r => (r.commissionCollected / 100).toFixed(2) },
      { header: 'Vehicle Deduction', value: r => (r.vehicleDeduction / 100).toFixed(2) },
      { header: 'Cancel Fees', value: r => (r.cancelFees / 100).toFixed(2) },
      { header: 'Deductions', value: r => (r.deductionTotal / 100).toFixed(2) },
      { header: 'Reimbursements', value: r => (r.reimbursementTotal / 100).toFixed(2) },
      { header: 'Net Payable', value: r => (r.netPayable / 100).toFixed(2) },
    ]
    const csv = toCSV(payroll, columns)
    downloadCSV(`payroll-${startDate}_to_${endDate}.csv`, csv)
  }

  return (
    <div className="space-y-6">
      {/* Period + instructor selector */}
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
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">Instructor</label>
            <Select value={instructorId} onValueChange={setInstructorId}>
              <SelectTrigger className="h-9 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All instructors</SelectItem>
                {instructors
                  .filter(i => i.is_active)
                  .map(i => (
                    <SelectItem key={i.id} value={i.id}>
                      {getFullName(i.user)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
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

      {/* Payroll summary table */}
      {payroll.length === 0 ? (
        <div className="flex items-center justify-center py-16 border rounded-lg">
          <p className="text-sm text-muted-foreground">No active instructors.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Instructor</TableHead>
                <TableHead className="text-center">Completed</TableHead>
                <TableHead className="text-center">Cancelled</TableHead>
                <TableHead className="text-center">No-show</TableHead>
                <TableHead className="text-center">Hours</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Assign</TableHead>
                <TableHead className="text-right">Vehicle</TableHead>
                <TableHead className="text-right">Cancel</TableHead>
                <TableHead className="text-right">Deduct</TableHead>
                <TableHead className="text-right">Reimb</TableHead>
                <TableHead className="text-right">Net Payable</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payroll.map(({
                instructor, completedCount, cancelledCount, noShowCount, totalHours,
                grossEarnings, vehicleDeduction, cancelFees,
                assignmentEarnings, deductionTotal, reimbursementTotal, netPayable,
              }) => (
                <TableRow key={instructor.id}>
                  <TableCell className="font-medium">{getFullName(instructor.user)}</TableCell>
                  <TableCell className="text-center">{completedCount}</TableCell>
                  <TableCell className="text-center text-muted-foreground">{cancelledCount}</TableCell>
                  <TableCell className="text-center text-muted-foreground">{noShowCount}</TableCell>
                  <TableCell className="text-center">{totalHours.toFixed(1)}</TableCell>
                  <TableCell className="text-right">{dollars(grossEarnings)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {assignmentEarnings > 0 ? dollars(assignmentEarnings) : '—'}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {vehicleDeduction > 0 ? `-${dollars(vehicleDeduction)}` : '—'}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {cancelFees > 0 ? `-${dollars(cancelFees)}` : '—'}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {deductionTotal > 0 ? `-${dollars(deductionTotal)}` : '—'}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {reimbursementTotal > 0 ? `+${dollars(reimbursementTotal)}` : '—'}
                  </TableCell>
                  <TableCell className="text-right font-semibold">{dollars(netPayable)}</TableCell>
                </TableRow>
              ))}

              {/* Totals row */}
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell>Total</TableCell>
                <TableCell className="text-center">{totals.lessons}</TableCell>
                <TableCell className="text-center">{totals.cancelled}</TableCell>
                <TableCell className="text-center">{totals.noShow}</TableCell>
                <TableCell className="text-center">{totals.hours.toFixed(1)}</TableCell>
                <TableCell className="text-right">{dollars(totals.gross)}</TableCell>
                <TableCell className="text-right">{totals.assignments > 0 ? dollars(totals.assignments) : '—'}</TableCell>
                <TableCell className="text-right">{totals.vehicle > 0 ? `-${dollars(totals.vehicle)}` : '—'}</TableCell>
                <TableCell className="text-right">{totals.cancelFees > 0 ? `-${dollars(totals.cancelFees)}` : '—'}</TableCell>
                <TableCell className="text-right">{totals.deductions > 0 ? `-${dollars(totals.deductions)}` : '—'}</TableCell>
                <TableCell className="text-right">{totals.reimbursements > 0 ? `+${dollars(totals.reimbursements)}` : '—'}</TableCell>
                <TableCell className="text-right">{dollars(totals.net)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}

      {/* Detailed lessons */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lessons — {periodLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          {detailLessons.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No lessons in range.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Instructor</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Package</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead>Cancelled</TableHead>
                    <TableHead>No-show</TableHead>
                    <TableHead className="text-center">Hours</TableHead>
                    <TableHead className="text-right">Earning</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailLessons.map(l => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{getFullName(l.instructor.user)}</TableCell>
                      <TableCell>{getFullName(l.student.user)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {packageByStudent.get(l.student_id) ?? '—'}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={LESSON_STATUS_BADGE[l.status]}>{l.status.replace('_', ' ')}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtDate(l.completed_at)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtDate(l.cancelled_at)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtDate(l.no_show_at)}</TableCell>
                      <TableCell className="text-center">{(l.duration_minutes / 60).toFixed(1)}</TableCell>
                      <TableCell className="text-right">
                        {l.instructor_earning_cents > 0 ? dollars(l.instructor_earning_cents) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assignments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assignments — {periodLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No assignments in range.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Instructor</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-center">Duration</TableHead>
                    <TableHead>Detail</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Earning</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssignments.map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{getFullName(a.instructor.user)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {format(parseISO(a.scheduled_at), 'MMM d, yyyy · h:mm a')}
                      </TableCell>
                      <TableCell className="text-center">{durationLabel(a.duration_minutes)}</TableCell>
                      <TableCell className="text-muted-foreground">{a.detail || '—'}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={a.status === 'completed' ? 'default' : a.status === 'cancelled' ? 'outline' : 'secondary'}>
                          {a.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {a.earning_cents > 0 ? dollars(a.earning_cents) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deductions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Deductions — {periodLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredDeductions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No deductions in range.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Instructor</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Detail</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDeductions.map(d => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{getFullName(d.instructor.user)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtDate(d.date)}</TableCell>
                      <TableCell>{DEDUCTION_LABEL[d.type]}</TableCell>
                      <TableCell className="text-muted-foreground">{d.detail || '—'}</TableCell>
                      <TableCell className="text-right text-destructive">-{dollars(d.amount_cents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reimbursements */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reimbursements — {periodLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredReimbursements.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No reimbursements in range.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Instructor</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Detail</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Evidence</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReimbursements.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{getFullName(r.instructor.user)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtDate(r.date)}</TableCell>
                      <TableCell className="text-muted-foreground">{r.detail || '—'}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={REIMBURSEMENT_BADGE[r.status]}>{r.status}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {r.evidence_path ? (
                          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2" onClick={() => openEvidence(r.id)}>
                            <FileText className="h-3.5 w-3.5" /> View
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className={`text-right ${reimbursementCounts(r.status) ? 'text-primary' : 'text-muted-foreground'}`}>
                        +{dollars(r.amount_cents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

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
