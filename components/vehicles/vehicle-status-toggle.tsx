'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Power, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Vehicle } from '@/types'

export function VehicleStatusToggle({ vehicle }: { vehicle: Vehicle }) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  async function handleToggle() {
    setIsLoading(true)
    await fetch(`/api/vehicles/${vehicle.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !vehicle.is_active }),
    })
    router.refresh()
    setIsLoading(false)
  }

  return (
    <Button
      variant={vehicle.is_active ? 'destructive' : 'outline'}
      size="sm"
      onClick={handleToggle}
      disabled={isLoading}
    >
      {isLoading ? (
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
      ) : (
        <Power className="mr-2 h-3.5 w-3.5" />
      )}
      {vehicle.is_active ? 'Deactivate' : 'Activate'}
    </Button>
  )
}
