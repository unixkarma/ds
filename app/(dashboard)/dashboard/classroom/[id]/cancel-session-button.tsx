'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

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

interface CancelSessionButtonProps {
  sessionId: string
}

export function CancelSessionButton({ sessionId }: CancelSessionButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleCancel() {
    setLoading(true)
    try {
      const res = await fetch(`/api/classroom/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error ?? 'Failed to cancel session')
        return
      }
      toast.success('Session cancelled')
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm">
          Cancel this session
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel session?</AlertDialogTitle>
          <AlertDialogDescription>
            The roster is preserved. Already-marked attendance will remain in
            student records.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep session</AlertDialogCancel>
          <AlertDialogAction onClick={handleCancel} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Cancel session
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
