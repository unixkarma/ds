'use client'

import { Printer, Download } from 'lucide-react'
import { format, parseISO } from 'date-fns'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate, formatDateTime, formatHours, getFullName } from '@/lib/utils'
import { toCSV, downloadCSV, type CSVColumn } from '@/lib/csv'
import type { StudentFullReport } from '@/lib/services/students'
import type { LessonStatus, ClassroomAttendanceStatus } from '@/types'

const csvDate = (iso: string) => format(parseISO(iso), 'yyyy-MM-dd')

const LESSON_BADGE: Record<LessonStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  scheduled: 'secondary',
  completed: 'default',
  cancelled: 'destructive',
  no_show: 'outline',
}

const ATTENDANCE_BADGE: Record<
  ClassroomAttendanceStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  enrolled: 'outline',
  present: 'default',
  late: 'secondary',
  absent: 'destructive',
  excused: 'secondary',
}

interface StudentFullReportProps {
  report: StudentFullReport
}

export function StudentFullReportView({ report }: StudentFullReportProps) {
  const {
    student,
    lessons,
    purchases,
    payments,
    ledger,
    classroomAttendance,
    balanceCents,
  } = report

  const completedBtw = lessons.filter((l) => l.status === 'completed').length
  const attendedClassroom = classroomAttendance.filter(
    (r) => r.status === 'present' || r.status === 'late'
  ).length

  // Export every section of the printable report into one CSV file, with a
  // labelled block per section.
  function handleExportCsv() {
    const lessonCols: CSVColumn<(typeof lessons)[number]>[] = [
      { header: 'Date', value: (l) => csvDate(l.scheduled_at) },
      { header: 'Instructor', value: (l) => getFullName(l.instructor.user) },
      { header: 'Hours', value: (l) => (l.duration_minutes / 60).toFixed(2) },
      { header: 'Status', value: (l) => l.status },
    ]
    const classroomCols: CSVColumn<(typeof classroomAttendance)[number]>[] = [
      { header: 'Date', value: (r) => csvDate(r.session.scheduled_at) },
      { header: 'Topic', value: (r) => r.session.topic || '' },
      { header: 'Hours', value: (r) => (r.session.duration_minutes / 60).toFixed(2) },
      { header: 'Status', value: (r) => r.status },
    ]
    const purchaseCols: CSVColumn<(typeof purchases)[number]>[] = [
      { header: 'Date', value: (p) => csvDate(p.created_at) },
      { header: 'Package', value: (p) => p.package_name },
      { header: 'Lessons activated', value: (p) => p.lessons_activated },
      { header: 'Total lessons', value: (p) => p.total_lessons },
      { header: 'Amount paid', value: (p) => (p.amount_paid_cents / 100).toFixed(2) },
      { header: 'Effective price', value: (p) => ((p.price_cents - (p.discount_cents ?? 0)) / 100).toFixed(2) },
    ]
    const paymentCols: CSVColumn<(typeof payments)[number]>[] = [
      { header: 'Date', value: (p) => csvDate(p.created_at) },
      { header: 'Method', value: (p) => p.payment_method ?? '' },
      { header: 'Amount', value: (p) => (p.amount_cents / 100).toFixed(2) },
      { header: 'Description', value: (p) => p.description ?? p.package?.name ?? '' },
    ]
    const ledgerCols: CSVColumn<(typeof ledger)[number]>[] = [
      { header: 'Date', value: (e) => csvDate(e.created_at) },
      { header: 'Type', value: (e) => e.entry_type },
      { header: 'Description', value: (e) => e.description },
      { header: 'Amount', value: (e) => (Number(e.amount_cents) / 100).toFixed(2) },
    ]

    const blocks = [
      ['Lessons', toCSV(lessons, lessonCols)],
      ['Classroom attendance', toCSV(classroomAttendance, classroomCols)],
      ['Purchases', toCSV(purchases, purchaseCols)],
      ['Payments', toCSV(payments, paymentCols)],
      ['Balance history', toCSV(ledger, ledgerCols)],
    ]
    const csv = blocks.map(([title, body]) => `${title}\n${body}`).join('\n\n')
    const slug = getFullName(student.user).toLowerCase().replace(/[^a-z0-9]+/g, '-')
    downloadCSV(`student-report-${slug}-${format(new Date(), 'yyyy-MM-dd')}.csv`, csv)
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header — actions hidden in print */}
      <div className="flex items-start justify-between print:border-b print:pb-4">
        <div>
          <h1 className="text-2xl font-bold">{getFullName(student.user)}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Student record · Enrolled {formatDate(student.enrollment_date)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Generated {formatDateTime(new Date().toISOString())}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={handleExportCsv}>
            <Download className="h-4 w-4 mr-1" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1" />
            Print
          </Button>
        </div>
      </div>

      {/* Profile */}
      <Section title="Profile">
        <Grid>
          <Pair label="Email" value={student.user.email || '—'} />
          <Pair label="Phone" value={student.user.phone || '—'} />
          <Pair
            label="Date of birth"
            value={
              student.user.date_of_birth ? formatDate(student.user.date_of_birth) : '—'
            }
          />
          <Pair label="Age group" value={student.age_group} />
          <Pair label="Status" value={student.status} />
          <Pair
            label="Permit"
            value={student.has_learners_permit ? student.permit_number || 'Yes' : 'No'}
          />
        </Grid>
        {student.notes && (
          <p className="mt-3 text-sm whitespace-pre-wrap">{student.notes}</p>
        )}
      </Section>

      {/* Summary */}
      <Section title="Summary">
        <Grid>
          <Pair label="BTW lessons purchased" value={student.total_lessons_purchased} />
          <Pair label="BTW lessons completed" value={completedBtw} />
          <Pair
            label="BTW lessons remaining"
            value={student.total_lessons_purchased - student.total_lessons_completed}
          />
          <Pair
            label="Classroom sessions attended"
            value={student.classroom_sessions_attended}
          />
          <Pair
            label="Balance"
            value={
              <span
                className={
                  balanceCents > 0
                    ? 'text-destructive'
                    : balanceCents < 0
                    ? 'text-primary'
                    : ''
                }
              >
                {balanceCents > 0
                  ? `Owes ${formatCurrency(balanceCents)}`
                  : balanceCents < 0
                  ? `Credit ${formatCurrency(Math.abs(balanceCents))}`
                  : formatCurrency(0)}
              </span>
            }
          />
        </Grid>
      </Section>

      {/* BTW lesson history */}
      <Section title={`BTW lessons (${lessons.length})`}>
        {lessons.length === 0 ? (
          <Empty>No lessons on record.</Empty>
        ) : (
          <ReportTable
            headers={['Date & time', 'Instructor', 'Duration', 'Status']}
            rows={lessons.map((l) => [
              formatDateTime(l.scheduled_at),
              getFullName(l.instructor.user),
              formatHours(l.duration_minutes),
              <Badge key={`${l.id}-st`} variant={LESSON_BADGE[l.status]}>
                {l.status.replace('_', ' ')}
              </Badge>,
            ])}
          />
        )}
      </Section>

      {/* Classroom attendance */}
      <Section title={`Classroom attendance (${classroomAttendance.length})`}>
        {classroomAttendance.length === 0 ? (
          <Empty>No classroom sessions on record.</Empty>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-2">
              Attended {attendedClassroom} of {classroomAttendance.length} enrolled
              sessions.
            </p>
            <ReportTable
              headers={['Date & time', 'Topic', 'Duration', 'Status']}
              rows={classroomAttendance.map((r) => [
                formatDateTime(r.session.scheduled_at),
                r.session.topic || '—',
                formatHours(r.session.duration_minutes),
                <Badge key={`${r.id}-st`} variant={ATTENDANCE_BADGE[r.status]}>
                  {r.status}
                </Badge>,
              ])}
            />
          </>
        )}
      </Section>

      {/* Purchases */}
      <Section title={`Purchases (${purchases.length})`}>
        {purchases.length === 0 ? (
          <Empty>No purchases yet.</Empty>
        ) : (
          <ReportTable
            headers={['Date', 'Package', 'Lessons', 'Classroom', 'Paid']}
            rows={purchases.map((p) => [
              formatDate(p.created_at),
              p.package_name,
              `${p.lessons_activated}/${p.total_lessons}`,
              p.classroom_required ? `${p.classroom_required} h` : '—',
              `${formatCurrency(p.amount_paid_cents)} / ${formatCurrency(
                p.price_cents - (p.discount_cents ?? 0)
              )}`,
            ])}
          />
        )}
      </Section>

      {/* Payments */}
      <Section title={`Payments (${payments.length})`}>
        {payments.length === 0 ? (
          <Empty>No payments recorded.</Empty>
        ) : (
          <ReportTable
            headers={['Date', 'Method', 'Amount', 'Description']}
            rows={payments.map((p) => [
              formatDate(p.created_at),
              p.payment_method ?? '—',
              formatCurrency(p.amount_cents),
              p.description ?? p.package?.name ?? '—',
            ])}
          />
        )}
      </Section>

      {/* Ledger */}
      <Section title={`Balance history (${ledger.length})`}>
        {ledger.length === 0 ? (
          <Empty>No ledger entries.</Empty>
        ) : (
          <ReportTable
            headers={['Date', 'Type', 'Description', 'Amount']}
            rows={ledger.map((e) => [
              formatDate(e.created_at),
              e.entry_type,
              e.description,
              <span
                key={`${e.id}-am`}
                className={
                  Number(e.amount_cents) > 0
                    ? 'text-destructive'
                    : Number(e.amount_cents) < 0
                    ? 'text-primary'
                    : ''
                }
              >
                {Number(e.amount_cents) > 0 ? '+' : ''}
                {formatCurrency(Math.abs(Number(e.amount_cents)))}
              </span>,
            ])}
          />
        )}
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 print:break-inside-avoid">
      <h2 className="text-base font-semibold border-b pb-1">{title}</h2>
      {children}
    </section>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
      {children}
    </dl>
  )
}

function Pair({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2 border-b border-dashed border-muted pb-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground py-2">{children}</p>
}

function ReportTable({
  headers,
  rows,
}: {
  headers: string[]
  rows: React.ReactNode[][]
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            {headers.map((h) => (
              <th
                key={h}
                className="text-left font-medium text-muted-foreground pb-2 pr-4"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row, idx) => (
            <tr key={idx}>
              {row.map((cell, c) => (
                <td key={c} className="py-2 pr-4 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
