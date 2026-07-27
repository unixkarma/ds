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
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { DatePicker } from '@/components/ui/date-picker'
import { getFullName } from '@/lib/utils'
import type { LessonWithRelations, LessonStatus, InstructorWithUser } from '@/types'

const STATUS_BADGE: Record<LessonStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  scheduled: 'default',
  completed: 'secondary',
  cancelled: 'outline',
  no_show: 'destructive',
}

interface LessonDetailDialogProps {
  lesson: LessonWithRelations | null
  instructors: InstructorWithUser[]
  onClose: () => void
}

export function LessonDetailDialog({ lesson, instructors, onClose }: LessonDetailDialogProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)
  const [isRescheduling, setIsRescheduling] = useState(false)
  const [isMarkingStatus, setIsMarkingStatus] = useState(false)
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [showReschedule, setShowReschedule] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleTime, setRescheduleTime] = useState('')
  const [editInstructorId, setEditInstructorId] = useState('')
  const [editPickup, setEditPickup] = useState('')
  const [editDropoff, setEditDropoff] = useState('')
  const [editNotes, setEditNotes] = useState('')

  if (!lesson) return null

  const lessonStart = new Date(lesson.scheduled_at)
  const lessonEnd = new Date(lessonStart.getTime() + lesson.duration_minutes * 60 * 1000)
  const isScheduled = lesson.status === 'scheduled'

  function openReschedule() {
    // Pre-fill with the lesson's current date/time so the user can tweak instead of filling blank
    setRescheduleDate(format(lessonStart, 'yyyy-MM-dd'))
    setRescheduleTime(format(lessonStart, 'HH:mm'))
    setShowReschedule(true)
    setError(null)
  }

  function openEdit() {
    setEditInstructorId(lesson!.instructor_id)
    setEditPickup(lesson!.pickup_location)
    setEditDropoff(lesson!.dropoff_location)
    setEditNotes(lesson!.notes_additional)
    setShowEdit(true)
    setError(null)
  }

  async function handleSaveEdit() {
    setIsSavingEdit(true)
    setError(null)
    try {
      const res = await fetch(`/api/lessons/${lesson!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instructorId: editInstructorId !== lesson!.instructor_id ? editInstructorId : undefined,
          pickupLocation: editPickup,
          dropoffLocation: editDropoff,
          notesAdditional: editNotes,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Failed to update lesson.')
        return
      }
      setShowEdit(false)
      onClose()
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setIsSavingEdit(false)
    }
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

  function handleOpenChange(open: boolean) {
    if (!open) {
      setError(null)
      setShowReschedule(false)
      setShowEdit(false)
      setRescheduleDate('')
      setRescheduleTime('')
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
            {lesson.lesson_type === 'road_test' ? (
              <Badge variant="outline" className="border-amber-500/50 text-amber-600">
                Road Test
              </Badge>
            ) : (
              <span className="text-muted-foreground">Regular BTW Lesson</span>
            )}
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
                <DatePicker
                  value={rescheduleDate}
                  onChange={setRescheduleDate}
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

        {/* Edit form — pickup/dropoff, notes, instructor */}
        {showEdit && (
          <div className="border rounded-lg p-3 space-y-3">
            <p className="text-sm font-medium">Edit lesson:</p>
            <div className="space-y-1.5">
              <Label className="text-xs">Instructor</Label>
              <Select value={editInstructorId} onValueChange={setEditInstructorId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {instructors.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {getFullName(i.user)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Pickup Location</Label>
                <Input
                  value={editPickup}
                  onChange={e => setEditPickup(e.target.value)}
                  placeholder="Street address + ZIP"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Dropoff Location</Label>
                <Input
                  value={editDropoff}
                  onChange={e => setEditDropoff(e.target.value)}
                  placeholder="Street address + ZIP"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Additional Notes</Label>
              <Textarea
                rows={2}
                maxLength={150}
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                placeholder="Any special instructions or notes..."
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveEdit} disabled={isSavingEdit}>
                {isSavingEdit && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowEdit(false)
                  setError(null)
                }}
              >
                Go back
              </Button>
            </div>
          </div>
        )}

        {/* Action buttons — only for scheduled lessons */}
        {isScheduled && !showReschedule && !showEdit && (
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
              onClick={openEdit}
            >
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={openReschedule}
            >
              Reschedule
            </Button>
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
