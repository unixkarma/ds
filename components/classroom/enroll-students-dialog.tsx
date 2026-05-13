'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Plus, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { StudentWithUser } from '@/types'

// ── Inline picker: used inside the create-session form ───────────
interface EnrollStudentsPickerProps {
  students: StudentWithUser[]
  selected: string[]
  onChange: (next: string[]) => void
  capacity: number
}

export function EnrollStudentsPicker({
  students,
  selected,
  onChange,
  capacity,
}: EnrollStudentsPickerProps) {
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return students
    return students.filter((s) =>
      `${s.user.first_name} ${s.user.last_name} ${s.user.email}`
        .toLowerCase()
        .includes(term)
    )
  }, [q, students])

  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((sid) => sid !== id))
    } else {
      if (capacity > 0 && selected.length >= capacity) {
        toast.error('Capacity reached')
        return
      }
      onChange([...selected, id])
    }
  }

  return (
    <div className="border rounded-md">
      <div className="p-2 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search students…"
            className="pl-7 h-8 text-sm"
          />
        </div>
      </div>
      <div className="max-h-56 overflow-y-auto divide-y">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground p-3 text-center">No students.</p>
        ) : (
          filtered.map((s) => {
            const checked = selected.includes(s.id)
            return (
              <label
                key={s.id}
                className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(s.id)}
                  className="h-4 w-4"
                />
                <span className="truncate">
                  {s.user.first_name} {s.user.last_name}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {s.user.email}
                </span>
              </label>
            )
          })
        )}
      </div>
      <div className="p-2 border-t text-xs text-muted-foreground flex items-center justify-between">
        <span>
          {selected.length} selected{capacity > 0 && ` / ${capacity} capacity`}
        </span>
      </div>
    </div>
  )
}

// ── Dialog: used on the session detail page to add more students ──
interface EnrollStudentsDialogProps {
  sessionId: string
  students: StudentWithUser[]
  alreadyEnrolledIds: string[]
  capacity: number
}

export function EnrollStudentsDialog({
  sessionId,
  students,
  alreadyEnrolledIds,
  capacity,
}: EnrollStudentsDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const available = useMemo(
    () => students.filter((s) => !alreadyEnrolledIds.includes(s.id)),
    [students, alreadyEnrolledIds]
  )

  const seatsLeft = Math.max(0, capacity - alreadyEnrolledIds.length)

  async function handleEnroll() {
    if (selected.length === 0) return
    setSaving(true)
    try {
      const res = await fetch(`/api/classroom/${sessionId}/enrollments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_ids: selected }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error ?? 'Failed to enroll')
        return
      }
      toast.success(`${selected.length} student(s) enrolled`)
      setSelected([])
      setOpen(false)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4 mr-1" />
          Enroll students
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enroll students</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          {seatsLeft} seat{seatsLeft === 1 ? '' : 's'} remaining.
        </p>
        <EnrollStudentsPicker
          students={available}
          selected={selected}
          onChange={setSelected}
          capacity={seatsLeft}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleEnroll} disabled={saving || selected.length === 0}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Enroll
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
