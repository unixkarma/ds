'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save } from 'lucide-react'

import { cn, DAY_LABELS } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { Availability } from '@/types'

interface DayRow {
  enabled: boolean
  start_time: string
  end_time: string
}

// Days ordered Mon–Sun for a work-week feel: 1,2,3,4,5,6,0
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

function buildInitialState(existing: Availability[]): DayRow[] {
  return DAY_ORDER.map((dayIndex) => {
    const slot = existing.find((a) => a.day_of_week === dayIndex)
    return slot
      ? { enabled: true, start_time: slot.start_time.slice(0, 5), end_time: slot.end_time.slice(0, 5) }
      : { enabled: false, start_time: '09:00', end_time: '17:00' }
  })
}

interface AvailabilityFormProps {
  instructorId: string
  existing: Availability[]
}

export function AvailabilityForm({ instructorId, existing }: AvailabilityFormProps) {
  const router = useRouter()
  const [rows, setRows] = useState<DayRow[]>(buildInitialState(existing))
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  function toggleDay(i: number) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, enabled: !r.enabled } : r)))
  }

  function updateTime(i: number, field: 'start_time' | 'end_time', value: string) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)))
  }

  async function handleSave() {
    // Validate enabled rows
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (row.enabled && row.end_time <= row.start_time) {
        setError(`End time must be after start time for ${DAY_LABELS[DAY_ORDER[i]]}`)
        return
      }
    }

    setIsLoading(true)
    setError(null)

    const slots = rows
      .map((row, i) => ({ ...row, day_of_week: DAY_ORDER[i] }))
      .filter((row) => row.enabled)
      .map(({ day_of_week, start_time, end_time }) => ({ day_of_week, start_time, end_time }))

    try {
      const response = await fetch(`/api/instructors/${instructorId}/availability`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots }),
      })

      if (!response.ok) {
        const data = await response.json()
        setError(data.error ?? 'Failed to save availability.')
        return
      }

      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        {rows.map((row, i) => {
          const dayLabel = DAY_LABELS[DAY_ORDER[i]]
          return (
            <div
              key={DAY_ORDER[i]}
              className={cn(
                'flex items-center gap-3 p-3 rounded-lg border text-sm transition-colors',
                row.enabled ? 'bg-background' : 'bg-muted/40'
              )}
            >
              {/* Day toggle */}
              <button
                type="button"
                onClick={() => toggleDay(i)}
                className={cn(
                  'w-4 h-4 rounded border-2 flex-shrink-0 transition-colors',
                  row.enabled
                    ? 'bg-primary border-primary'
                    : 'bg-background border-muted-foreground/40'
                )}
                aria-label={`Toggle ${dayLabel}`}
              >
                {row.enabled && (
                  <svg viewBox="0 0 10 10" className="w-full h-full text-primary-foreground fill-current">
                    <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>

              {/* Day name */}
              <span className={cn('w-24 font-medium', !row.enabled && 'text-muted-foreground')}>
                {dayLabel}
              </span>

              {/* Time inputs — disabled when day is off */}
              <div className="flex items-center gap-2 flex-1">
                <Input
                  type="time"
                  value={row.start_time}
                  onChange={(e) => updateTime(i, 'start_time', e.target.value)}
                  disabled={!row.enabled}
                  className="w-32 disabled:opacity-40"
                />
                <span className="text-muted-foreground">to</span>
                <Input
                  type="time"
                  value={row.end_time}
                  onChange={(e) => updateTime(i, 'end_time', e.target.value)}
                  disabled={!row.enabled}
                  className="w-32 disabled:opacity-40"
                />
              </div>
            </div>
          )
        })}
      </div>

      <Button onClick={handleSave} disabled={isLoading} size="sm">
        {isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Save className="mr-2 h-4 w-4" />
        )}
        Save Availability
      </Button>
    </div>
  )
}
