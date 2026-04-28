'use client'

import { useState, useMemo } from 'react'
import { parseISO, startOfDay, endOfDay, format } from 'date-fns'
import { Calendar, CheckCircle2, XCircle, AlertCircle, Download } from 'lucide-react'
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
import { formatDateTime, getFullName } from '@/lib/utils'
import { toCSV, downloadCSV, type CSVColumn } from '@/lib/csv'
import type { LessonWithRelations, InstructorWithUser, LessonStatus } from '@/types'

const STATUS_BADGE: Record<LessonStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  scheduled: 'outline',
  completed: 'default',
  cancelled: 'secondary',
  no_show: 'destructive',
}

const STATUS_LABEL: Record<LessonStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No Show',
}

interface LessonsReportProps {
  lessons: LessonWithRelations[]
  instructors: InstructorWithUser[]
}

export function LessonsReport({ lessons, instructors }: LessonsReportProps) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [instructorId, setInstructorId] = useState('all')
  const [status, setStatus] = useState('all')

  const filtered = useMemo(() => {
    return lessons.filter(lesson => {
      const date = parseISO(lesson.scheduled_at)
      if (startDate && date < startOfDay(parseISO(startDate))) return false
      if (endDate && date > endOfDay(parseISO(endDate))) return false
      if (instructorId !== 'all' && lesson.instructor_id !== instructorId) return false
      if (status !== 'all' && lesson.status !== status) return false
      return true
    })
  }, [lessons, startDate, endDate, instructorId, status])

  const completedCount = filtered.filter(l => l.status === 'completed').length
  const cancelledCount = filtered.filter(l => l.status === 'cancelled').length
  const noShowCount = filtered.filter(l => l.status === 'no_show').length

  const handleExport = () => {
    const columns: CSVColumn<LessonWithRelations>[] = [
      { header: 'Date', value: l => format(parseISO(l.scheduled_at), 'yyyy-MM-dd HH:mm') },
      { header: 'Student', value: l => getFullName(l.student.user) },
      { header: 'Instructor', value: l => getFullName(l.instructor.user) },
      { header: 'Vehicle', value: l => l.vehicle ? `${l.vehicle.year} ${l.vehicle.make} ${l.vehicle.model}` : '' },
      { header: 'Duration (min)', value: l => l.duration_minutes },
      { header: 'Status', value: l => STATUS_LABEL[l.status] },
      { header: 'Sold By', value: l => l.sold_by ?? '' },
      { header: 'Price', value: l => (l.price_cents / 100).toFixed(2) },
      { header: 'Instructor Earning', value: l => (l.instructor_earning_cents / 100).toFixed(2) },
    ]
    const csv = toCSV(filtered, columns)
    const today = format(new Date(), 'yyyy-MM-dd')
    downloadCSV(`lessons-${today}.csv`, csv)
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
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">Instructor</label>
            <Select value={instructorId} onValueChange={setInstructorId}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Instructors</SelectItem>
                {instructors.map(i => (
                  <SelectItem key={i.id} value={i.id}>
                    {getFullName(i.user)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="no_show">No Show</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Lessons</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{filtered.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{completedCount}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {filtered.length > 0 ? Math.round((completedCount / filtered.length) * 100) : 0}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cancelled</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{cancelledCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">No Shows</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{noShowCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex items-center justify-center py-16 border rounded-lg">
          <p className="text-sm text-muted-foreground">No lessons match the selected filters.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date &amp; Time</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Instructor</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead className="text-center">Duration</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(lesson => (
                <TableRow key={lesson.id}>
                  <TableCell className="text-sm">{formatDateTime(lesson.scheduled_at)}</TableCell>
                  <TableCell className="font-medium">{getFullName(lesson.student.user)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {getFullName(lesson.instructor.user)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {lesson.vehicle
                      ? `${lesson.vehicle.year} ${lesson.vehicle.make} ${lesson.vehicle.model}`
                      : '—'}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{lesson.duration_minutes} min</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={STATUS_BADGE[lesson.status]}>
                      {STATUS_LABEL[lesson.status]}
                    </Badge>
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
