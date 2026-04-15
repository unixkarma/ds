'use client'

import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ResetPasswordButtonProps {
  instructorId: string
}

export function ResendInviteButton({ instructorId }: ResetPasswordButtonProps) {
  const [sending, setSending] = useState(false)

  async function handleReset() {
    setSending(true)
    const res = await fetch(`/api/instructors/${instructorId}/resend-invite`, {
      method: 'POST',
    })
    if (res.ok) {
      alert('Password reset email sent successfully')
    } else {
      const data = await res.json()
      alert(`Failed to send: ${data.error}`)
    }
    setSending(false)
  }

  return (
    <Button variant="outline" size="sm" onClick={handleReset} disabled={sending}>
      <KeyRound className="mr-2 h-3.5 w-3.5" />
      {sending ? 'Sending...' : 'Reset Password'}
    </Button>
  )
}
