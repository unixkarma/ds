'use client'

import { useState, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { GraduationCap, Car, Wallet, Download } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency, getFullName } from '@/lib/utils'
import { toCSV, downloadCSV, type CSVColumn } from '@/lib/csv'
import type {
  StudentWithUser,
  StudentPurchaseWithRelations,
  StudentStatus,
} from '@/types'

const STATUS_BADGE: Record<StudentStatus, 'default' | 'secondary' | 'outline'> = {
  active: 'default',
  inactive: 'secondary',
  completed: 'outline',
}

interface StudentHoursReportProps {
  students: StudentWithUser[]
  purchases: StudentPurchaseWithRelations[]
  balances?: Record<string, number>
}

export function StudentHoursReport({
  students,
  purchases,
  balances = {},
}: StudentHoursReportProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | StudentStatus>('all')
  const [search, setSearch] = useState('')

  const matchesFilters = (s: StudentWithUser, term: string) =>
    (statusFilter === 'all' || s.status === statusFilter) &&
    (!term || getFullName(s.user).toLowerCase().includes(term))

  // One row per purchase — shows the package bought and when. A student with
  // several purchases appears on multiple rows (by design).
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return purchases
      .filter((p) => matchesFilters(p.student, term))
      .map((p) => ({
        purchase: p,
        student: p.student,
        lessonsActivated: p.lessons_activated,
        totalLessons: p.total_lessons,
        classroomRequired: p.classroom_required ?? 0,
        balanceCents: balances[p.student_id] ?? 0,
      }))
      .sort((a, b) => parseISO(b.purchase.created_at).getTime() - parseISO(a.purchase.created_at).getTime())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchases, statusFilter, search, balances])

  // Summary cards aggregate per (distinct) student matching the filters.
  const summary = useMemo(() => {
    const term = search.trim().toLowerCase()
    const classroomRequiredByStudent = new Map<string, number>()
    for (const p of purchases) {
      classroomRequiredByStudent.set(
        p.student_id,
        (classroomRequiredByStudent.get(p.student_id) ?? 0) + (p.classroom_required ?? 0)
      )
    }
    return students
      .filter((s) => matchesFilters(s, term))
      .reduce(
        (acc, s) => {
          const classroomRequired = classroomRequiredByStudent.get(s.id) ?? 0
          const classroomRemaining = Math.max(0, classroomRequired - s.classroom_sessions_attended)
          const bal = balances[s.id] ?? 0
          return {
            count: acc.count + 1,
            btwRemaining: acc.btwRemaining + s.lessons_remaining,
            classroomRemaining: acc.classroomRemaining + classroomRemaining,
            owed: acc.owed + (bal > 0 ? bal : 0),
          }
        },
        { count: 0, btwRemaining: 0, classroomRemaining: 0, owed: 0 }
      )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, purchases, statusFilter, search, balances])

  const handleExport = () => {
    type Row = (typeof rows)[number]
    const columns: CSVColumn<Row>[] = [
      { header: 'Student', value: (r) => getFullName(r.student.user) },
      { header: 'Email', value: (r) => r.student.user.email ?? '' },
      { header: 'Status', value: (r) => r.student.status },
      { header: 'Package', value: (r) => r.purchase.package_name },
      { header: 'Purchase date', value: (r) => format(parseISO(r.purchase.created_at), 'yyyy-MM-dd') },
      { header: 'BTW activated', value: (r) => r.lessonsActivated },
      { header: 'BTW in package', value: (r) => r.totalLessons },
      { header: 'Classroom required', value: (r) => r.classroomRequired },
      { header: 'Balance', value: (r) => (r.balanceCents / 100).toFixed(2) },
    ]
    const csv = toCSV(rows, columns)
    downloadCSV(`student-hours-${format(new Date(), 'yyyy-MM-dd')}.csv`, csv)
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | StudentStatus)}
              className="h-9 px-3 rounded-md border border-input bg-background text-sm"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">Search</label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Student name"
              className="h-9 w-48"
            />
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={rows.length === 0}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">BTW hours remaining</CardTitle>
            <Car className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary.btwRemaining}</p>
            <p className="text-xs text-muted-foreground mt-1">Across {summary.count} students</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Classroom hours remaining</CardTitle>
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary.classroomRemaining}</p>
            <p className="text-xs text-muted-foreground mt-1">Required minus attended</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total owed</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(summary.owed)}</p>
            <p className="text-xs text-muted-foreground mt-1">Pending student balances</p>
          </CardContent>
        </Card>
      </div>

      {/* Table — one row per purchase */}
      {rows.length === 0 ? (
        <div className="flex items-center justify-center py-16 border rounded-lg">
          <p className="text-sm text-muted-foreground">No purchases match the selected filters.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead>Package</TableHead>
                <TableHead>Purchase date</TableHead>
                <TableHead className="text-center">BTW activated/total</TableHead>
                <TableHead className="text-center">Classroom required</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.purchase.id}>
                  <TableCell className="font-medium">{getFullName(r.student.user)}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={STATUS_BADGE[r.student.status]}>{r.student.status}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.purchase.package_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {format(parseISO(r.purchase.created_at), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">
                    {r.lessonsActivated}/{r.totalLessons}
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">
                    {r.classroomRequired}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.balanceCents > 0 ? (
                      <span className="text-destructive font-medium">{formatCurrency(r.balanceCents)}</span>
                    ) : r.balanceCents < 0 ? (
                      <span className="text-primary">−{formatCurrency(Math.abs(r.balanceCents))}</span>
                    ) : (
                      <span className="text-muted-foreground">{formatCurrency(0)}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
