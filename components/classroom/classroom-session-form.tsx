'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  ClassroomSession,
  InstructorWithUser,
  StudentWithUser,
} from '@/types'
import { EnrollStudentsPicker } from './enroll-students-dialog'

const schema = z.object({
  scheduled_date: z.string().min(1, 'Date is required'),
  scheduled_time: z.string().min(1, 'Time is required'),
  duration_minutes: z.string().min(1, 'Duration is required'),
  capacity: z.string().min(1, 'Capacity is required'),
  topic: z.string().max(150, 'Max 150 chars'),
  location: z.string().max(200, 'Max 200 chars'),
  instructor_id: z.string(),
  price_dollars: z.string(),
  earning_dollars: z.string(),
  notes: z.string().max(500, 'Max 500 chars'),
})

type Values = z.infer<typeof schema>

interface ClassroomSessionFormProps {
  instructors: InstructorWithUser[]
  students?: StudentWithUser[]   // only used when creating
  session?: ClassroomSession | null
  mode: 'create' | 'edit'
}

export function ClassroomSessionForm({
  instructors,
  students = [],
  session,
  mode,
}: ClassroomSessionFormProps) {
  const router = useRouter()
  const [selectedStudents, setSelectedStudents] = useState<string[]>([])

  const defaultValues: Values = useMemo(() => {
    if (session) {
      const d = new Date(session.scheduled_at)
      const pad = (n: number) => String(n).padStart(2, '0')
      return {
        scheduled_date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        scheduled_time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
        duration_minutes: String(session.duration_minutes),
        capacity: String(session.capacity),
        topic: session.topic,
        location: session.location,
        instructor_id: session.instructor_id ?? 'unassigned',
        price_dollars: (session.price_cents / 100).toFixed(2),
        earning_dollars: (session.instructor_earning_cents / 100).toFixed(2),
        notes: session.notes,
      }
    }
    return {
      scheduled_date: '',
      scheduled_time: '',
      duration_minutes: '60',
      capacity: '20',
      topic: '',
      location: '',
      instructor_id: 'unassigned',
      price_dollars: '0',
      earning_dollars: '0',
      notes: '',
    }
  }, [session])

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues })

  async function onSubmit(values: Values) {
    const scheduledAt = new Date(`${values.scheduled_date}T${values.scheduled_time}`)
    if (Number.isNaN(scheduledAt.getTime())) {
      toast.error('Invalid date or time')
      return
    }

    const payload: Record<string, unknown> = {
      instructor_id: values.instructor_id === 'unassigned' ? null : values.instructor_id,
      scheduled_at: scheduledAt.toISOString(),
      duration_minutes: parseInt(values.duration_minutes, 10),
      capacity: parseInt(values.capacity, 10),
      topic: values.topic,
      location: values.location,
      price_cents: Math.round(parseFloat(values.price_dollars || '0') * 100),
      instructor_earning_cents: Math.round(parseFloat(values.earning_dollars || '0') * 100),
      notes: values.notes,
    }

    if (mode === 'create') payload.student_ids = selectedStudents

    const url = mode === 'create' ? '/api/classroom' : `/api/classroom/${session!.id}`
    const method = mode === 'create' ? 'POST' : 'PATCH'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(body.error ?? 'Failed to save session')
      return
    }

    const body = await res.json()
    const id = mode === 'create' ? body.session.id : session!.id

    toast.success(mode === 'create' ? 'Session created' : 'Session updated')
    router.push(`/dashboard/classroom/${id}`)
    router.refresh()
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 max-w-2xl">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="cs-date">Date</Label>
          <Input id="cs-date" type="date" {...form.register('scheduled_date')} />
          {form.formState.errors.scheduled_date && (
            <p className="text-xs text-destructive">{form.formState.errors.scheduled_date.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cs-time">Time</Label>
          <Input id="cs-time" type="time" {...form.register('scheduled_time')} />
          {form.formState.errors.scheduled_time && (
            <p className="text-xs text-destructive">{form.formState.errors.scheduled_time.message}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="cs-duration">Duration (minutes)</Label>
          <Input id="cs-duration" inputMode="numeric" {...form.register('duration_minutes')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cs-capacity">Capacity</Label>
          <Input id="cs-capacity" inputMode="numeric" {...form.register('capacity')} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cs-instructor">Instructor</Label>
        <Select
          value={form.watch('instructor_id')}
          onValueChange={(v) => form.setValue('instructor_id', v)}
        >
          <SelectTrigger id="cs-instructor">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {instructors.map((inst) => (
              <SelectItem key={inst.id} value={inst.id}>
                {inst.user.first_name} {inst.user.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cs-topic">Topic</Label>
        <Input id="cs-topic" placeholder="Defensive driving — Module 3" {...form.register('topic')} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cs-location">Location</Label>
        <Input id="cs-location" placeholder="123 Main St, Room 4" {...form.register('location')} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="cs-price">Price per student ($)</Label>
          <Input id="cs-price" inputMode="decimal" {...form.register('price_dollars')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cs-earning">Instructor earning ($)</Label>
          <Input id="cs-earning" inputMode="decimal" {...form.register('earning_dollars')} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cs-notes">Notes</Label>
        <Textarea id="cs-notes" rows={2} {...form.register('notes')} />
      </div>

      {mode === 'create' && students.length > 0 && (
        <div className="space-y-2">
          <Label>Enroll students (optional)</Label>
          <EnrollStudentsPicker
            students={students}
            selected={selectedStudents}
            onChange={setSelectedStudents}
            capacity={parseInt(form.watch('capacity') || '0', 10) || 0}
          />
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {mode === 'create' ? 'Create session' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}
