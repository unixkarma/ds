'use client'

import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { GraduationCap, Users, CheckCircle2 } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { toCSV, downloadCSV, type CSVColumn } from '@/lib/csv'
import type { ClassroomSessionWithRelations } from '@/types'

interface ClassroomReportProps {
  sessions: ClassroomSessionWithRelations[]
}

export function ClassroomReport({ sessions }: ClassroomReportProps) {
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const filtered = useMemo(() => {
    const from = fromDate ? new Date(fromDate) : null
    const to = toDate ? new Date(toDate) : null
    return sessions.filter((s) => {
      const d = new Date(s.scheduled_at)
      if (from && d < from) return false
      if (to) {
        const end = new Date(to)
        end.setDate(end.getDate() + 1)
        if (d >= end) return false
      }
      return true
    })
  }, [sessions, fromDate, toDate])

  const { totalEnrollments, totalAttended } = useMemo(() => {
    let enrol = 0
    let att = 0
    for (const s of filtered) {
      for (const r of s.attendance ?? []) {
        enrol += 1
        if (r.status === 'present' || r.status === 'late') att += 1
      }
    }
    return { totalEnrollments: enrol, totalAttended: att }
  }, [filtered])

  const attendanceRate = totalEnrollments === 0 ? 0 : totalAttended / totalEnrollments

  function exportCsv() {
    const rows = filtered.map((s) => {
      const enrolled = s.attendance?.length ?? 0
      const attended = (s.attendance ?? []).filter(
        (r) => r.status === 'present' || r.status === 'late'
      ).length
      return {
        date: format(new Date(s.scheduled_at), 'yyyy-MM-dd'),
        time: format(new Date(s.scheduled_at), 'HH:mm'),
        topic: s.topic,
        location: s.location,
        instructor: s.instructor
          ? `${s.instructor.user.first_name} ${s.instructor.user.last_name}`.trim()
          : 'Unassigned',
        capacity: s.capacity,
        enrolled,
        attended,
        status: s.status,
      }
    })
    const cols: CSVColumn<(typeof rows)[number]>[] = [
      { header: 'Date', value: (r) => r.date },
      { header: 'Time', value: (r) => r.time },
      { header: 'Topic', value: (r) => r.topic },
      { header: 'Location', value: (r) => r.location },
      { header: 'Instructor', value: (r) => r.instructor },
      { header: 'Capacity', value: (r) => r.capacity },
      { header: 'Enrolled', value: (r) => r.enrolled },
      { header: 'Attended', value: (r) => r.attended },
      { header: 'Status', value: (r) => r.status },
    ]
    downloadCSV(`classroom-report-${format(new Date(), 'yyyy-MM-dd')}.csv`, toCSV(rows, cols))
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sessions</CardTitle>
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filtered.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Enrollments</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalEnrollments}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Attendance rate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Math.round(attendanceRate * 100)}%</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {totalAttended} of {totalEnrollments} attended
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Sessions</CardTitle>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
            Export CSV
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="cr-from" className="text-xs">From</Label>
              <Input
                id="cr-from"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cr-to" className="text-xs">To</Label>
              <Input
                id="cr-to"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No sessions in selected range.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Topic</TableHead>
                  <TableHead>Instructor</TableHead>
                  <TableHead>Enrolled</TableHead>
                  <TableHead>Attended</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => {
                  const enrolled = s.attendance?.length ?? 0
                  const attended = (s.attendance ?? []).filter(
                    (r) => r.status === 'present' || r.status === 'late'
                  ).length
                  const start = new Date(s.scheduled_at)
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="text-sm">
                        {format(start, 'MMM d, yyyy')} · {format(start, 'h:mm a')}
                      </TableCell>
                      <TableCell className="text-sm">{s.topic || '—'}</TableCell>
                      <TableCell className="text-sm">
                        {s.instructor
                          ? `${s.instructor.user.first_name} ${s.instructor.user.last_name}`
                          : 'Unassigned'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {enrolled} / {s.capacity}
                      </TableCell>
                      <TableCell className="text-sm">{attended}</TableCell>
                      <TableCell>
                        <Badge variant={s.status === 'cancelled' ? 'outline' : 'default'}>
                          {s.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
