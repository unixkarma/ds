'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface SetPasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  studentId: string | null
  studentName: string
}

// Admin-facing dialog to set a student's password directly (no email needed).
// The password is shown as plain text so the admin can read it back to the student.
export function SetPasswordDialog({
  open,
  onOpenChange,
  studentId,
  studentName,
}: SetPasswordDialogProps) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  function handleOpenChange(next: boolean) {
    if (!next) {
      setPassword('')
      setConfirm('')
      setError(null)
      setDone(false)
      setLoading(false)
    }
    onOpenChange(next)
  }

  async function submit() {
    setError(null)
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (!studentId) return

    setLoading(true)
    const res = await fetch(`/api/students/${studentId}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'set', password }),
    })
    setLoading(false)

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Failed to set password')
      return
    }
    setDone(true)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Set password</DialogTitle>
          <DialogDescription>
            Set a new password for {studentName}. Share it with them so they can log in.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-4 py-2">
            <Alert>
              <AlertDescription>
                Password updated. Share the new password with {studentName}.
              </AlertDescription>
            </Alert>
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="text"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={loading}>
                {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Set password
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
