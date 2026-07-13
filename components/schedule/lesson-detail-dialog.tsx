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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { LessonWithRelations, LessonStatus, StudentWithUser } from '@/types'

const STATUS_BADGE: Record<LessonStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  scheduled: 'default',
  completed: 'secondary',
  cancelled: 'outline',
  no_show: 'destructive',
}

interface LessonDetailDialogProps {
  lesson: LessonWithRelations | null
  students?: StudentWithUser[]
  onClose: () => void
}

export function LessonDetailDialog({ lesson, students = [], onClose }: LessonDetailDialogProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)
  const [isRescheduling, setIsRescheduling] = useState(false)
  const [isMarkingStatus, setIsMarkingStatus] = useState(false)
  const [showReschedule, setShowReschedule] = useState(false)
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleTime, setRescheduleTime] = useState('')
  const [showAddObserver, setShowAddObserver] = useState(false)
  const [observerStudentId, setObserverStudentId] = useState('')
  const [isAddingObserver, setIsAddingObserver] = useState(false)

  if (!lesson) return null

  const lessonStart = new Date(lesson.scheduled_at)
  const lessonEnd = new Date(lessonStart.getTime() + lesson.duration_minutes * 60 * 1000)
  const isScheduled = lesson.status === 'scheduled'
  const isObservation = lesson.lesson_type === 'observation'
  // An observer can be added to a scheduled DRIVE lesson: a second student rides
  // along in the same car/slot and accrues observation hours. Exclude the driver.
  const canAddObserver = isScheduled && lesson.lesson_type === 'drive'
  const observerCandidates = students.filter(s => s.id !== lesson.student_id)

  function openReschedule() {
    // Pre-fill with the lesson's current date/time so the user can tweak instead of filling blank
    setRescheduleDate(format(lessonStart, 'yyyy-MM-dd'))
    setRescheduleTime(format(lessonStart, 'HH:mm'))
    setShowReschedule(true)
    setError(null)
  }

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
      setConfirmCancelOpen(false)
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

  async function handleAddObserver() {
    if (!observerStudentId) {
      setError('Please select a student to observe.')
      return
    }
    setIsAddingObserver(true)
    setError(null)
    try {
      const res = await fetch('/api/lessons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: observerStudentId,
          instructorId: lesson!.instructor_id,
          scheduledAt: lesson!.scheduled_at,
          durationMinutes: lesson!.duration_minutes,
          vehicleId: lesson!.vehicle?.id ?? null,
          pickupLocation: lesson!.pickup_location ?? '',
          dropoffLocation: lesson!.dropoff_location ?? '',
          lessonType: 'observation',
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Failed to add observer.')
        return
      }
      onClose()
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setIsAddingObserver(false)
    }
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      setError(null)
      setShowReschedule(false)
      setRescheduleDate('')
      setRescheduleTime('')
      setShowAddObserver(false)
      setObserverStudentId('')
      onClose()
    }
  }

  return (
    <Dialog open={!!lesson} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
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

          <Row label="Type">
            {isObservation ? (
              <Badge variant="outline" className="border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300">
                Observation (ride-along)
              </Badge>
            ) : (
              <span>Behind-the-wheel</span>
            )}
          </Row>

          <Row label={isObservation ? 'Observer' : 'Student'}>
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

          {lesson.pickup_location && (
            <Row label="Pickup">
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lesson.pickup_location)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {lesson.pickup_location}
              </a>
            </Row>
          )}

          {lesson.dropoff_location && (
            <Row label="Dropoff">
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lesson.dropoff_location)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {lesson.dropoff_location}
              </a>
            </Row>
          )}

          {(lesson.notes_covered || lesson.notes_practice || lesson.notes_additional) && (
            <div className="pt-1 space-y-2">
              {lesson.notes_covered && (
                <div>
                  <p className="text-muted-foreground mb-0.5 text-xs font-medium">What was covered</p>
                  <p className="bg-muted rounded-md p-2 text-sm">{lesson.notes_covered}</p>
                </div>
              )}
              {lesson.notes_practice && (
                <div>
                  <p className="text-muted-foreground mb-0.5 text-xs font-medium">Needs to practice on</p>
                  <p className="bg-muted rounded-md p-2 text-sm">{lesson.notes_practice}</p>
                </div>
              )}
              {lesson.notes_additional && (
                <div>
                  <p className="text-muted-foreground mb-0.5 text-xs font-medium">Additional notes</p>
                  <p className="bg-muted rounded-md p-2 text-sm">{lesson.notes_additional}</p>
                </div>
              )}
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

        {/* Add-observer form */}
        {showAddObserver && (
          <div className="border rounded-lg p-3 space-y-3">
            <div>
              <p className="text-sm font-medium">Add an observer</p>
              <p className="text-muted-foreground text-xs mt-0.5">
                A second student rides along in this car and accrues observation
                hours. They aren&apos;t charged and don&apos;t use a lesson credit.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Student</Label>
              <Select value={observerStudentId} onValueChange={setObserverStudentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a student" />
                </SelectTrigger>
                <SelectContent>
                  {observerCandidates.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.user.first_name} {s.user.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAddObserver} disabled={isAddingObserver}>
                {isAddingObserver && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Add observer
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowAddObserver(false)
                  setObserverStudentId('')
                  setError(null)
                }}
              >
                Go back
              </Button>
            </div>
          </div>
        )}

        {/* Action buttons — only for scheduled lessons */}
        {isScheduled && !showReschedule && !showAddObserver && (
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
              onClick={openReschedule}
            >
              Reschedule
            </Button>
            {canAddObserver && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowAddObserver(true)
                  setError(null)
                }}
              >
                Add observer
              </Button>
            )}
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmCancelOpen(true)}
              disabled={isCancelling}
            >
              {isCancelling && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Cancel
            </Button>
          </div>
        )}
      </DialogContent>

      <AlertDialog open={confirmCancelOpen} onOpenChange={setConfirmCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this lesson?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the lesson scheduled for{' '}
              <strong>{format(lessonStart, 'MMM d, yyyy · h:mm a')}</strong>. This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCancelling}>Keep Lesson</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                handleCancel()
              }}
              disabled={isCancelling}
            >
              {isCancelling && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Yes, Cancel Lesson
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
