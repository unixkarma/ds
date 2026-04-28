'use client'

import { useState, useMemo } from 'react'
import { parseISO, startOfDay, endOfDay, format } from 'date-fns'
import { UserCheck, BookOpen, Download } from 'lucide-react'
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

interface InstructorWorkloadReportProps {
  instructors: InstructorWithUser[]
  lessons: LessonWithRelations[]
}

export function InstructorWorkloadReport({ instructors, lessons }: InstructorWorkloadReportProps) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const filteredLessons = useMemo(() => {
    return lessons.filter(lesson => {
      const date = parseISO(lesson.scheduled_at)
      if (startDate && date < startOfDay(parseISO(startDate))) return false
      if (endDate && date > endOfDay(parseISO(endDate))) return false
      return true
    })
  }, [lessons, startDate, endDate])

  const workload = useMemo(() => {
    return instructors
      .map(instructor => {
        const instructorLessons = filteredLessons.filter(l => l.instructor_id === instructor.id)
        return {
          instructor,
          total: instructorLessons.length,
          completed: instructorLessons.filter(l => l.status === 'completed').length,
          scheduled: instructorLessons.filter(l => l.status === 'scheduled').length,
          cancelled: instructorLessons.filter(l => l.status === 'cancelled').length,
          no_show: instructorLessons.filter(l => l.status === 'no_show').length,
        }
      })
      .sort((a, b) => b.total - a.total)
  }, [instructors, filteredLessons])

  const totalLessons = workload.reduce((sum, w) => sum + w.total, 0)

  const handleExport = () => {
    type Row = (typeof workload)[number]
    const columns: CSVColumn<Row>[] = [
      { header: 'Instructor', value: r => getFullName(r.instructor.user) },
      { header: 'Status', value: r => r.instructor.is_active ? 'Active' : 'Inactive' },
      { header: 'Total', value: r => r.total },
      { header: 'Completed', value: r => r.completed },
      { header: 'Scheduled', value: r => r.scheduled },
      { header: 'Cancelled', value: r => r.cancelled },
      { header: 'No Show', value: r => r.no_show },
    ]
    const csv = toCSV(workload, columns)
    const today = format(new Date(), 'yyyy-MM-dd')
    downloadCSV(`workload-${today}.csv`, csv)
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
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
          disabled={workload.length === 0}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Instructors</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{instructors.length}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {instructors.filter(i => i.is_active).length} active
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Lessons</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalLessons}</p>
            <p className="text-xs text-muted-foreground mt-1">Across all instructors</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      {workload.length === 0 ? (
        <div className="flex items-center justify-center py-16 border rounded-lg">
          <p className="text-sm text-muted-foreground">No instructors found.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Instructor</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center">Total</TableHead>
                <TableHead className="text-center">Completed</TableHead>
                <TableHead className="text-center">Scheduled</TableHead>
                <TableHead className="text-center">Cancelled</TableHead>
                <TableHead className="text-center">No Show</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workload.map(({ instructor, total, completed, scheduled, cancelled, no_show }) => (
                <TableRow key={instructor.id}>
                  <TableCell className="font-medium">{getFullName(instructor.user)}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={instructor.is_active ? 'default' : 'outline'}>
                      {instructor.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center font-medium">{total}</TableCell>
                  <TableCell className="text-center text-muted-foreground">{completed}</TableCell>
                  <TableCell className="text-center text-muted-foreground">{scheduled}</TableCell>
                  <TableCell className="text-center text-muted-foreground">{cancelled}</TableCell>
                  <TableCell className="text-center text-muted-foreground">{no_show}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
