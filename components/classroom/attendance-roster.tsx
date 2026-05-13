'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import type {
  ClassroomAttendanceStatus,
  ClassroomAttendanceWithStudent,
} from '@/types'

const STATUS_OPTIONS: { value: ClassroomAttendanceStatus; label: string }[] = [
  { value: 'enrolled', label: 'Enrolled' },
  { value: 'present', label: 'Present' },
  { value: 'late', label: 'Late' },
  { value: 'absent', label: 'Absent' },
  { value: 'excused', label: 'Excused' },
]

const STATUS_BADGE: Record<ClassroomAttendanceStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  enrolled: 'outline',
  present: 'default',
  late: 'secondary',
  absent: 'destructive',
  excused: 'secondary',
}

interface AttendanceRosterProps {
  sessionId: string
  roster: ClassroomAttendanceWithStudent[]
  canUnenroll: boolean
  canEdit: boolean
}

export function AttendanceRoster({
  sessionId,
  roster,
  canUnenroll,
  canEdit,
}: AttendanceRosterProps) {
  const router = useRouter()
  const initial = Object.fromEntries(
    roster.map((r) => [r.student_id, r.status])
  ) as Record<string, ClassroomAttendanceStatus>

  const [draft, setDraft] = useState<Record<string, ClassroomAttendanceStatus>>(initial)
  const [saving, setSaving] = useState(false)

  if (roster.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No students enrolled yet.
      </p>
    )
  }

  const isDirty = roster.some((r) => draft[r.student_id] !== r.status)

  async function save() {
    const entries = roster
      .filter((r) => draft[r.student_id] !== r.status)
      .map((r) => ({ student_id: r.student_id, status: draft[r.student_id] }))

    if (entries.length === 0) return

    setSaving(true)
    try {
      const res = await fetch(`/api/classroom/${sessionId}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error ?? 'Failed to save attendance')
        return
      }
      toast.success('Attendance saved')
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  async function unenroll(studentId: string) {
    if (!confirm('Remove this student from the session?')) return
    const res = await fetch(
      `/api/classroom/${sessionId}/enrollments?student_id=${studentId}`,
      { method: 'DELETE' }
    )
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(body.error ?? 'Failed to remove student')
      return
    }
    toast.success('Student removed')
    router.refresh()
  }

  return (
    <div className="space-y-3">
      <div className="border rounded-md divide-y">
        {roster.map((r) => (
          <div
            key={r.id}
            className="flex items-center gap-3 px-3 py-2 text-sm"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">
                {r.student.user.first_name} {r.student.user.last_name}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {r.student.user.email}
              </p>
            </div>
            {canEdit ? (
              <Select
                value={draft[r.student_id]}
                onValueChange={(v) =>
                  setDraft((d) => ({ ...d, [r.student_id]: v as ClassroomAttendanceStatus }))
                }
              >
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Badge variant={STATUS_BADGE[r.status]}>{r.status}</Badge>
            )}
            {canUnenroll && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => unenroll(r.student_id)}
                className="h-8 w-8 p-0"
                title="Remove student"
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            )}
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={save} disabled={!isDirty || saving} size="sm">
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save attendance
          </Button>
        </div>
      )}
    </div>
  )
}
