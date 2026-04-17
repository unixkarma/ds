'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save, Plus, Trash2 } from 'lucide-react'

import { cn, DAY_LABELS } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Availability } from '@/types'

interface TimeBlock {
  start_time: string
  end_time: string
}

interface DayState {
  enabled: boolean
  blocks: TimeBlock[]
}

// Days ordered Mon–Sun for a work-week feel: 1,2,3,4,5,6,0
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

const BUFFER_OPTIONS = [
  { value: '0', label: 'No buffer' },
  { value: '5', label: '5 min' },
  { value: '10', label: '10 min' },
  { value: '15', label: '15 min' },
  { value: '20', label: '20 min' },
  { value: '30', label: '30 min' },
]

function buildInitialState(existing: Availability[]): DayState[] {
  return DAY_ORDER.map((dayIndex) => {
    const daySlots = existing
      .filter((a) => a.day_of_week === dayIndex)
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .map((a) => ({
        start_time: a.start_time.slice(0, 5),
        end_time: a.end_time.slice(0, 5),
      }))

    return daySlots.length > 0
      ? { enabled: true, blocks: daySlots }
      : { enabled: false, blocks: [{ start_time: '09:00', end_time: '17:00' }] }
  })
}

interface AvailabilityFormProps {
  instructorId: string
  existing: Availability[]
  currentBufferMinutes?: number
}

export function AvailabilityForm({ instructorId, existing, currentBufferMinutes = 0 }: AvailabilityFormProps) {
  const router = useRouter()
  const [days, setDays] = useState<DayState[]>(buildInitialState(existing))
  const [bufferMinutes, setBufferMinutes] = useState(String(currentBufferMinutes))
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  function toggleDay(dayIdx: number) {
    setDays(prev => prev.map((d, i) => i === dayIdx ? { ...d, enabled: !d.enabled } : d))
  }

  function updateBlock(dayIdx: number, blockIdx: number, field: 'start_time' | 'end_time', value: string) {
    setDays(prev => prev.map((d, i) => {
      if (i !== dayIdx) return d
      const blocks = d.blocks.map((b, j) => j === blockIdx ? { ...b, [field]: value } : b)
      return { ...d, blocks }
    }))
  }

  function addBlock(dayIdx: number) {
    setDays(prev => prev.map((d, i) => {
      if (i !== dayIdx) return d
      const lastBlock = d.blocks[d.blocks.length - 1]
      // Default new block starts 1 hour after last block ends
      const [h, m] = lastBlock.end_time.split(':').map(Number)
      const newStartMin = (h * 60 + m) + 60
      const newEndMin = newStartMin + 120
      const newStart = `${String(Math.floor(Math.min(newStartMin, 23 * 60) / 60)).padStart(2, '0')}:${String(Math.min(newStartMin, 23 * 60) % 60).padStart(2, '0')}`
      const newEnd = `${String(Math.floor(Math.min(newEndMin, 23 * 60 + 59) / 60)).padStart(2, '0')}:${String(Math.min(newEndMin, 23 * 60 + 59) % 60).padStart(2, '0')}`
      return { ...d, blocks: [...d.blocks, { start_time: newStart, end_time: newEnd }] }
    }))
  }

  function removeBlock(dayIdx: number, blockIdx: number) {
    setDays(prev => prev.map((d, i) => {
      if (i !== dayIdx) return d
      if (d.blocks.length <= 1) return d
      return { ...d, blocks: d.blocks.filter((_, j) => j !== blockIdx) }
    }))
  }

  async function handleSave() {
    // Validate
    for (let i = 0; i < days.length; i++) {
      const day = days[i]
      if (!day.enabled) continue
      const dayLabel = DAY_LABELS[DAY_ORDER[i]]

      for (let j = 0; j < day.blocks.length; j++) {
        const block = day.blocks[j]
        if (block.end_time <= block.start_time) {
          setError(`${dayLabel} block ${j + 1}: end time must be after start time`)
          return
        }
        // Check overlap with previous block
        if (j > 0) {
          const prev = day.blocks[j - 1]
          if (block.start_time < prev.end_time) {
            setError(`${dayLabel}: time blocks must not overlap`)
            return
          }
        }
      }
    }

    setIsLoading(true)
    setError(null)

    const slots = days.flatMap((day, i) => {
      if (!day.enabled) return []
      return day.blocks.map(block => ({
        day_of_week: DAY_ORDER[i],
        start_time: block.start_time,
        end_time: block.end_time,
      }))
    })

    try {
      // Save availability
      const availRes = await fetch(`/api/instructors/${instructorId}/availability`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots }),
      })

      if (!availRes.ok) {
        const data = await availRes.json()
        setError(data.error ?? 'Failed to save availability.')
        return
      }

      // Save buffer minutes
      const bufferRes = await fetch(`/api/instructors/${instructorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bufferMinutes: parseInt(bufferMinutes, 10) }),
      })

      if (!bufferRes.ok) {
        const data = await bufferRes.json()
        setError(data.error ?? 'Failed to save buffer setting.')
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
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Buffer setting */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-lg border bg-muted/30">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Buffer between lessons</p>
          <p className="text-xs text-muted-foreground">
            Travel time between locations. Slots will be spaced accordingly.
          </p>
        </div>
        <Select value={bufferMinutes} onValueChange={setBufferMinutes}>
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BUFFER_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Day rows */}
      <div className="space-y-3">
        {days.map((day, dayIdx) => {
          const dayLabel = DAY_LABELS[DAY_ORDER[dayIdx]]
          return (
            <div
              key={DAY_ORDER[dayIdx]}
              className={cn(
                'rounded-lg border p-3 transition-colors',
                day.enabled ? 'bg-background' : 'bg-muted/40'
              )}
            >
              {/* Day header */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => toggleDay(dayIdx)}
                  className={cn(
                    'w-4 h-4 rounded border-2 flex-shrink-0 transition-colors',
                    day.enabled
                      ? 'bg-primary border-primary'
                      : 'bg-background border-muted-foreground/40'
                  )}
                  aria-label={`Toggle ${dayLabel}`}
                >
                  {day.enabled && (
                    <svg viewBox="0 0 10 10" className="w-full h-full text-primary-foreground fill-current">
                      <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
                <span className={cn('font-medium text-sm', !day.enabled && 'text-muted-foreground')}>
                  {dayLabel}
                </span>
                {day.enabled && (
                  <span className="text-xs text-muted-foreground ml-auto">
                    {day.blocks.length} block{day.blocks.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Time blocks */}
              {day.enabled && (
                <div className="mt-2 space-y-2 pl-7">
                  {day.blocks.map((block, blockIdx) => (
                    <div key={blockIdx} className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={block.start_time}
                        onChange={(e) => updateBlock(dayIdx, blockIdx, 'start_time', e.target.value)}
                        className="w-28"
                      />
                      <span className="text-muted-foreground text-sm">to</span>
                      <Input
                        type="time"
                        value={block.end_time}
                        onChange={(e) => updateBlock(dayIdx, blockIdx, 'end_time', e.target.value)}
                        className="w-28"
                      />
                      {day.blocks.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeBlock(dayIdx, blockIdx)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground"
                    onClick={() => addBlock(dayIdx)}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Add break block
                  </Button>
                </div>
              )}
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
