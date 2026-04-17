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
  existingNotesCovered?: string
  existingNotesPractice?: string
  existingNotesAdditional?: string
}

export function LessonActions({
  lessonId,
  status,
  existingNotesCovered = '',
  existingNotesPractice = '',
  existingNotesAdditional = '',
}: LessonActionsProps) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false)
  const [notesCovered, setNotesCovered] = useState(existingNotesCovered)
  const [notesPractice, setNotesPractice] = useState(existingNotesPractice)
  const [notesAdditional, setNotesAdditional] = useState(existingNotesAdditional)

  if (status !== 'scheduled') return null

  async function handleAction(
    newStatus: 'completed' | 'no_show' | 'cancelled',
    lessonNotes?: { covered: string; practice: string; additional: string },
  ) {
    setLoading(newStatus)
    setError(null)

    try {
      const body: Record<string, unknown> = { status: newStatus }
      if (lessonNotes) {
        body.notesCovered = lessonNotes.covered
        body.notesPractice = lessonNotes.practice
        body.notesAdditional = lessonNotes.additional
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
    <div className="flex flex-wrap items-center gap-1.5">
      {error && (
        <span className="text-xs text-destructive w-full mb-1">{error}</span>
      )}

      {/* Complete — opens notes dialog */}
      <Button
        size="sm"
        variant="outline"
        className="h-8 text-emerald-600 border-emerald-200 hover:text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300"
        onClick={() => setCompleteDialogOpen(true)}
        disabled={!!loading}
      >
        <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
        Complete
      </Button>

      {/* Complete dialog with notes */}
      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Complete Lesson</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="notes-covered">What was covered</Label>
              <Textarea
                id="notes-covered"
                value={notesCovered}
                onChange={(e) => setNotesCovered(e.target.value)}
                maxLength={150}
                placeholder="e.g. Parallel parking, highway merging, three-point turns"
                rows={2}
              />
              <p className="text-xs text-muted-foreground text-right">{notesCovered.length}/150</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes-practice">Needs to practice on</Label>
              <Textarea
                id="notes-practice"
                value={notesPractice}
                onChange={(e) => setNotesPractice(e.target.value)}
                maxLength={150}
                placeholder="e.g. Mirror checks before lane changes, smoother braking"
                rows={2}
              />
              <p className="text-xs text-muted-foreground text-right">{notesPractice.length}/150</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes-additional">Additional notes</Label>
              <Textarea
                id="notes-additional"
                value={notesAdditional}
                onChange={(e) => setNotesAdditional(e.target.value)}
                maxLength={150}
                placeholder="Any other observations..."
                rows={2}
              />
              <p className="text-xs text-muted-foreground text-right">{notesAdditional.length}/150</p>
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
              onClick={() => handleAction('completed', {
                covered: notesCovered,
                practice: notesPractice,
                additional: notesAdditional,
              })}
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
        variant="outline"
        className="h-8 text-amber-600 border-amber-200 hover:text-amber-700 hover:bg-amber-50 hover:border-amber-300"
        onClick={() => handleAction('no_show')}
        disabled={!!loading}
      >
        {loading === 'no_show' ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <XCircle className="mr-1.5 h-3.5 w-3.5" />
        )}
        No Show
      </Button>

      {/* Cancel */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-destructive border-red-200 hover:text-destructive hover:bg-red-50 hover:border-red-300"
            disabled={!!loading}
          >
            {loading === 'cancelled' ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Ban className="mr-1.5 h-3.5 w-3.5" />
            )}
            Cancel
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
