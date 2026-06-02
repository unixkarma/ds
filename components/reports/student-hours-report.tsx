'use client'

import { useState, useMemo } from 'react'
import { format } from 'date-fns'
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

  // Total classroom hours bought per student (snapshot across purchases).
  const classroomRequiredByStudent = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of purchases) {
      map.set(p.student_id, (map.get(p.student_id) ?? 0) + (p.classroom_required ?? 0))
    }
    return map
  }, [purchases])

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return students
      .filter((s) => statusFilter === 'all' || s.status === statusFilter)
      .filter((s) => !term || getFullName(s.user).toLowerCase().includes(term))
      .map((s) => {
        const btwRemaining = s.lessons_remaining
        const classroomRequired = classroomRequiredByStudent.get(s.id) ?? 0
        const classroomRemaining = Math.max(0, classroomRequired - s.classroom_sessions_attended)
        return {
          student: s,
          btwPurchased: s.total_lessons_purchased,
          btwCompleted: s.total_lessons_completed,
          btwRemaining,
          classroomRequired,
          classroomAttended: s.classroom_sessions_attended,
          classroomRemaining,
          balanceCents: balances[s.id] ?? 0,
        }
      })
      .sort((a, b) => b.btwRemaining - a.btwRemaining)
  }, [students, statusFilter, search, classroomRequiredByStudent, balances])

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        btwRemaining: acc.btwRemaining + r.btwRemaining,
        classroomRemaining: acc.classroomRemaining + r.classroomRemaining,
        owed: acc.owed + (r.balanceCents > 0 ? r.balanceCents : 0),
      }),
      { btwRemaining: 0, classroomRemaining: 0, owed: 0 }
    )
  }, [rows])

  const handleExport = () => {
    type Row = (typeof rows)[number]
    const columns: CSVColumn<Row>[] = [
      { header: 'Student', value: (r) => getFullName(r.student.user) },
      { header: 'Email', value: (r) => r.student.user.email ?? '' },
      { header: 'Status', value: (r) => r.student.status },
      { header: 'BTW purchased', value: (r) => r.btwPurchased },
      { header: 'BTW completed', value: (r) => r.btwCompleted },
      { header: 'BTW remaining', value: (r) => r.btwRemaining },
      { header: 'Classroom required', value: (r) => r.classroomRequired },
      { header: 'Classroom attended', value: (r) => r.classroomAttended },
      { header: 'Classroom remaining', value: (r) => r.classroomRemaining },
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
            <p className="text-2xl font-bold">{totals.btwRemaining}</p>
            <p className="text-xs text-muted-foreground mt-1">Across {rows.length} students</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Classroom hours remaining</CardTitle>
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totals.classroomRemaining}</p>
            <p className="text-xs text-muted-foreground mt-1">Required minus attended</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total owed</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(totals.owed)}</p>
            <p className="text-xs text-muted-foreground mt-1">Pending student balances</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="flex items-center justify-center py-16 border rounded-lg">
          <p className="text-sm text-muted-foreground">No students match the selected filters.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center">BTW done/bought</TableHead>
                <TableHead className="text-center">BTW remaining</TableHead>
                <TableHead className="text-center">Classroom att/req</TableHead>
                <TableHead className="text-center">Classroom remaining</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.student.id}>
                  <TableCell className="font-medium">{getFullName(r.student.user)}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={STATUS_BADGE[r.student.status]}>{r.student.status}</Badge>
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">
                    {r.btwCompleted}/{r.btwPurchased}
                  </TableCell>
                  <TableCell className="text-center font-medium">
                    {r.btwRemaining > 0 ? (
                      <span className="text-amber-600">{r.btwRemaining}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">
                    {r.classroomAttended}/{r.classroomRequired}
                  </TableCell>
                  <TableCell className="text-center font-medium">
                    {r.classroomRemaining > 0 ? (
                      <span className="text-amber-600">{r.classroomRemaining}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
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
