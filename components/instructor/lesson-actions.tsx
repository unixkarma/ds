'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, XCircle, Ban, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface LessonActionsProps {
  lessonId: string
  status: string
  existingNotes?: string | null
}

export function LessonActions({ lessonId, status, existingNotes }: LessonActionsProps) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false)
  const [notes, setNotes] = useState(existingNotes ?? '')

  if (status !== 'scheduled') return null

  async function handleAction(newStatus: 'completed' | 'no_show' | 'cancelled', lessonNotes?: string) {
    setLoading(newStatus)
    setError(null)

    try {
      const body: Record<string, unknown> = { status: newStatus }
      if (lessonNotes !== undefined) {
        body.notes = lessonNotes || null
      }

      const res = await fetch(`/api/lessons/${lessonId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Failed to update lesson.')
        return
      }

      setCompleteDialogOpen(false)
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex items-center gap-1">
      {error && (
        <span className="text-xs text-destructive mr-2">{error}</span>
      )}

      {/* Complete — opens notes dialog */}
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
        onClick={() => setCompleteDialogOpen(true)}
        disabled={!!loading}
        title="Mark Complete"
      >
        <CheckCircle className="h-4 w-4" />
      </Button>

      {/* Complete dialog with notes */}
      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Complete Lesson</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="lesson-notes">Lesson Notes</Label>
              <Textarea
                id="lesson-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What did you cover? Any areas to focus on next time? (e.g. parallel parking needs more practice, highway driving went well...)"
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                These notes help the next instructor see the student&apos;s progress.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCompleteDialogOpen(false)}
              disabled={!!loading}
            >
              Cancel
            </Button>
            <Button
              onClick={() => handleAction('completed', notes)}
              disabled={!!loading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {loading === 'completed' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Mark Complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* No Show */}
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
        onClick={() => handleAction('no_show')}
        disabled={!!loading}
        title="No Show"
      >
        {loading === 'no_show' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <XCircle className="h-4 w-4" />
        )}
      </Button>

      {/* Cancel */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-red-50"
            disabled={!!loading}
            title="Cancel Lesson"
          >
            {loading === 'cancelled' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Ban className="h-4 w-4" />
            )}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this lesson?</AlertDialogTitle>
            <AlertDialogDescription>
              A cancellation fee may be applied to your account. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go Back</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleAction('cancelled')}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Yes, Cancel Lesson
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
