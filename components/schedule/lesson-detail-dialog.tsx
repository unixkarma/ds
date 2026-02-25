'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { Loader2 } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { LessonWithRelations, LessonStatus } from '@/types'

const STATUS_BADGE: Record<LessonStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  scheduled: 'default',
  completed: 'secondary',
  cancelled: 'outline',
  no_show: 'destructive',
}

interface LessonDetailDialogProps {
  lesson: LessonWithRelations | null
  onClose: () => void
}

export function LessonDetailDialog({ lesson, onClose }: LessonDetailDialogProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)
  const [isRescheduling, setIsRescheduling] = useState(false)
  const [isMarkingStatus, setIsMarkingStatus] = useState(false)
  const [showReschedule, setShowReschedule] = useState(false)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleTime, setRescheduleTime] = useState('')

  if (!lesson) return null

  const lessonStart = new Date(lesson.scheduled_at)
  const lessonEnd = new Date(lessonStart.getTime() + lesson.duration_minutes * 60 * 1000)
  const isScheduled = lesson.status === 'scheduled'

  async function handleCancel() {
    setIsCancelling(true)
    setError(null)
    try {
      const res = await fetch(`/api/lessons/${lesson!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Failed to cancel lesson.')
        return
      }
      onClose()
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setIsCancelling(false)
    }
  }

  async function handleMarkStatus(status: 'completed' | 'no_show') {
    setIsMarkingStatus(true)
    setError(null)
    try {
      const res = await fetch(`/api/lessons/${lesson!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Failed to update lesson.')
        return
      }
      onClose()
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setIsMarkingStatus(false)
    }
  }

  async function handleReschedule() {
    if (!rescheduleDate || !rescheduleTime) {
      setError('Please select both a date and time.')
      return
    }
    setIsRescheduling(true)
    setError(null)
    try {
      const scheduledAt = new Date(`${rescheduleDate}T${rescheduleTime}`).toISOString()
      const res = await fetch(`/api/lessons/${lesson!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Failed to reschedule lesson.')
        return
      }
      onClose()
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setIsRescheduling(false)
    }
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      setError(null)
      setShowReschedule(false)
      setRescheduleDate('')
      setRescheduleTime('')
      onClose()
    }
  }

  return (
    <Dialog open={!!lesson} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Lesson Details</DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3 text-sm">
          <Row label="Status">
            <Badge variant={STATUS_BADGE[lesson.status]}>
              {lesson.status.replace('_', ' ')}
            </Badge>
          </Row>

          <Row label="Student">
            {lesson.student.user.first_name} {lesson.student.user.last_name}
          </Row>

          <Row label="Instructor">
            {lesson.instructor.user.first_name} {lesson.instructor.user.last_name}
          </Row>

          <Row label="Date">
            {format(lessonStart, 'EEEE, MMMM d, yyyy')}
          </Row>

          <Row label="Time">
            {format(lessonStart, 'h:mm a')} – {format(lessonEnd, 'h:mm a')}
          </Row>

          <Row label="Duration">
            {lesson.duration_minutes} min
          </Row>

          {lesson.vehicle && (
            <Row label="Vehicle">
              {lesson.vehicle.year} {lesson.vehicle.make} {lesson.vehicle.model}
            </Row>
          )}

          {lesson.notes && (
            <div className="pt-1">
              <p className="text-muted-foreground mb-1">Notes</p>
              <p className="bg-muted rounded-md p-2 text-sm">{lesson.notes}</p>
            </div>
          )}
        </div>

        {/* Reschedule form */}
        {showReschedule && (
          <div className="border rounded-lg p-3 space-y-3">
            <p className="text-sm font-medium">Reschedule to:</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">New Date</Label>
                <Input
                  type="date"
                  value={rescheduleDate}
                  onChange={e => setRescheduleDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">New Time</Label>
                <Input
                  type="time"
                  value={rescheduleTime}
                  onChange={e => setRescheduleTime(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleReschedule} disabled={isRescheduling}>
                {isRescheduling && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Confirm
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowReschedule(false)
                  setError(null)
                }}
              >
                Go back
              </Button>
            </div>
          </div>
        )}

        {/* Action buttons — only for scheduled lessons */}
        {isScheduled && !showReschedule && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              onClick={() => handleMarkStatus('completed')}
              disabled={isMarkingStatus}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isMarkingStatus && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Mark Complete
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleMarkStatus('no_show')}
              disabled={isMarkingStatus}
            >
              No Show
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowReschedule(true)
                setError(null)
              }}
            >
              Reschedule
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleCancel}
              disabled={isCancelling}
            >
              {isCancelling && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Cancel
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right">{children}</span>
    </div>
  )
}
