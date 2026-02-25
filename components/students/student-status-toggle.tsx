'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Power, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { StudentWithUser } from '@/types'

interface StudentStatusToggleProps {
  student: StudentWithUser
}

export function StudentStatusToggle({ student }: StudentStatusToggleProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const isActive = student.status === 'active'

  async function handleToggle() {
    setIsLoading(true)
    await fetch(`/api/students/${student.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: isActive ? 'inactive' : 'active' }),
    })
    router.refresh()
    setIsLoading(false)
  }

  return (
    <Button
      variant={isActive ? 'destructive' : 'outline'}
      size="sm"
      onClick={handleToggle}
      disabled={isLoading}
    >
      {isLoading ? (
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
      ) : (
        <Power className="mr-2 h-3.5 w-3.5" />
      )}
      {isActive ? 'Deactivate' : 'Reactivate'}
    </Button>
  )
}
