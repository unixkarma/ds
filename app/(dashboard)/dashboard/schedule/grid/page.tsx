'use client'

// Minimal graphical scheduler grid (backend-first). Instructors are rows; their
// openings / booked lessons / days-off for the chosen date render as chips.
// Visual polish is intentionally deferred — this exercises /api/schedule/grid.

import { useCallback, useEffect, useState } from 'react'
import type { ScheduleGridData, ScheduleGridView } from '@/types'

const VIEWS: ScheduleGridView[] = ['multi-instructor', 'single-instructor', 'single-location']

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

const chipClass: Record<string, string> = {
  opening: 'bg-secondary text-secondary-foreground',
  lesson: 'bg-primary text-primary-foreground',
  'day-off': 'bg-muted text-muted-foreground line-through',
}

export default function ScheduleGridPage() {
  const [date, setDate] = useState(today)
  const [view, setView] = useState<ScheduleGridView>('multi-instructor')
  const [data, setData] = useState<ScheduleGridData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/schedule/grid?date=${date}&view=${view}`)
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to load')
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [date, view])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Scheduler grid</h1>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="border rounded-md px-3 py-1.5 bg-background"
        />
        <select
          value={view}
          onChange={e => setView(e.target.value as ScheduleGridView)}
          className="border rounded-md px-3 py-1.5 bg-background"
        >
          {VIEWS.map(v => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <button
          onClick={load}
          className="bg-primary text-primary-foreground rounded-md px-4 py-1.5 text-sm font-medium"
        >
          Refresh
        </button>
      </div>

      {loading && <p className="text-muted-foreground">Loading…</p>}
      {error && <p className="text-destructive">{error}</p>}

      {data && !loading && (
        <div className="space-y-3">
          {data.rows.length === 0 && (
            <p className="text-muted-foreground">No active instructors.</p>
          )}
          {data.rows.map(row => (
            <div key={row.instructor_id} className="border rounded-lg p-3">
              <div className="font-medium mb-2">{row.instructor_name || 'Unnamed instructor'}</div>
              {row.slots.length === 0 ? (
                <p className="text-sm text-muted-foreground">No slots this day.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {row.slots.map(s => (
                    <span
                      key={`${s.kind}-${s.id}`}
                      className={`text-xs rounded-md px-2 py-1 ${chipClass[s.kind] ?? 'bg-secondary'}`}
                      title={`${s.kind} · ${s.status}`}
                    >
                      {s.kind === 'day-off'
                        ? 'Day off'
                        : `${time(s.start)}${s.student_name ? ` · ${s.student_name}` : ''}`}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
