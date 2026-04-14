'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, XCircle, Ban, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
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
}

export function LessonActions({ lessonId, status }: LessonActionsProps) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (status !== 'scheduled') return null

  async function handleAction(newStatus: 'completed' | 'no_show' | 'cancelled') {
    setLoading(newStatus)
    setError(null)

    try {
      const res = await fetch(`/api/lessons/${lessonId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Failed to update lesson.')
        return
      }

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

      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
        onClick={() => handleAction('completed')}
        disabled={!!loading}
        title="Mark Complete"
      >
        {loading === 'completed' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle className="h-4 w-4" />
        )}
      </Button>

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
