'use client'

import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import { Users, BookOpen, CheckSquare, Download, DollarSign } from 'lucide-react'
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
import { cn, formatCurrency, formatDate, getFullName } from '@/lib/utils'
import { toCSV, downloadCSV, type CSVColumn } from '@/lib/csv'
import type { StudentWithUser, StudentStatus } from '@/types'

const STATUS_BADGE: Record<StudentStatus, 'default' | 'secondary' | 'outline'> = {
  active: 'default',
  inactive: 'outline',
  completed: 'secondary',
}

interface StudentProgressReportProps {
  students: StudentWithUser[]
  balances?: Record<string, number>
}

export function StudentProgressReport({
  students,
  balances = {},
}: StudentProgressReportProps) {
  const [status, setStatus] = useState('all')

  const filtered = useMemo(() => {
    if (status === 'all') return students
    return students.filter(s => s.status === status)
  }, [students, status])

  const totalPurchased = filtered.reduce((sum, s) => sum + s.total_lessons_purchased, 0)
  const avgCompleted = filtered.length > 0
    ? Math.round(filtered.reduce((sum, s) => sum + s.total_lessons_completed, 0) / filtered.length)
    : 0
  const totalOwedCents = filtered.reduce(
    (sum, s) => sum + Math.max(0, balances[s.id] ?? 0),
    0
  )

  const handleExport = () => {
    const columns: CSVColumn<StudentWithUser>[] = [
      { header: 'Student', value: s => getFullName(s.user) },
      { header: 'Email', value: s => s.user.email ?? '' },
      { header: 'Status', value: s => s.status },
      { header: 'Enrolled', value: s => formatDate(s.enrollment_date) },
      { header: 'Lessons Used', value: s => s.total_lessons_completed },
      { header: 'Lessons Available', value: s => s.lessons_remaining },
      { header: 'Lessons Purchased', value: s => s.total_lessons_purchased },
      {
        header: 'Progress %',
        value: s => s.total_lessons_purchased > 0
          ? Math.round((s.total_lessons_completed / s.total_lessons_purchased) * 100)
          : 0,
      },
      {
        header: 'Balance ($)',
        value: s => ((balances[s.id] ?? 0) / 100).toFixed(2),
      },
    ]
    const csv = toCSV(filtered, columns)
    const today = format(new Date(), 'yyyy-MM-dd')
    downloadCSV(`students-${today}.csv`, csv)
  }

  return (
    <div className="space-y-6">
      {/* Filter */}
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">Status</label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Students</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={filtered.length === 0}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Students</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{filtered.length}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {students.filter(s => s.status === 'active').length} active
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Lessons Purchased</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalPurchased}</p>
            <p className="text-xs text-muted-foreground mt-1">Across all students</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Completed</CardTitle>
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{avgCompleted}</p>
            <p className="text-xs text-muted-foreground mt-1">Lessons per student</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Owed</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className={cn('text-2xl font-bold', totalOwedCents > 0 && 'text-destructive')}>
              {formatCurrency(totalOwedCents)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {filtered.filter(s => (balances[s.id] ?? 0) > 0).length} with pending balance
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex items-center justify-center py-16 border rounded-lg">
          <p className="text-sm text-muted-foreground">No students match the selected filter.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead>Enrolled</TableHead>
                <TableHead className="text-center" title="Lessons completed">
                  Used
                </TableHead>
                <TableHead className="text-center" title="Lessons remaining">
                  Available
                </TableHead>
                <TableHead>Progress</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(student => {
                const pct = student.total_lessons_purchased > 0
                  ? Math.round((student.total_lessons_completed / student.total_lessons_purchased) * 100)
                  : 0
                const balanceCents = balances[student.id] ?? 0
                return (
                  <TableRow key={student.id}>
                    <TableCell className="font-medium">{getFullName(student.user)}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={STATUS_BADGE[student.status]}>{student.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(student.enrollment_date)}
                    </TableCell>
                    <TableCell className="text-center">{student.total_lessons_completed}</TableCell>
                    <TableCell className="text-center">{student.lessons_remaining}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 min-w-24">
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
                      </div>
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums font-medium',
                        balanceCents > 0 && 'text-destructive',
                        balanceCents === 0 && 'text-muted-foreground',
                        balanceCents < 0 && 'text-primary'
                      )}
                    >
                      {balanceCents === 0
                        ? '$0.00'
                        : balanceCents > 0
                        ? formatCurrency(balanceCents)
                        : `+${formatCurrency(-balanceCents)}`}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
