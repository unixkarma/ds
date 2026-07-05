'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

export function SubscribeButton({ label = 'Subscribe' }: { label?: string }) {
  const [loading, setLoading] = useState(false)

  async function onClick() {
    setLoading(true)
    try {
      const res = await fetch('/api/billing/checkout', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not start checkout')
      window.location.href = data.url
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start checkout')
      setLoading(false)
    }
  }

  return (
    <Button onClick={onClick} disabled={loading}>
      {loading ? 'Redirecting…' : label}
    </Button>
  )
}
