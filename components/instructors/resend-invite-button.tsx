'use client'

import { useState } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ResendInviteButtonProps {
  instructorId: string
}

export function ResendInviteButton({ instructorId }: ResendInviteButtonProps) {
  const [sending, setSending] = useState(false)

  async function handleResend() {
    setSending(true)
    const res = await fetch(`/api/instructors/${instructorId}/resend-invite`, {
      method: 'POST',
    })
    if (res.ok) {
      alert('Invitation resent successfully')
    } else {
      const data = await res.json()
      alert(`Failed to resend: ${data.error}`)
    }
    setSending(false)
  }

  return (
    <Button variant="outline" size="sm" onClick={handleResend} disabled={sending}>
      <Send className="mr-2 h-3.5 w-3.5" />
      {sending ? 'Sending...' : 'Resend Invite'}
    </Button>
  )
}
