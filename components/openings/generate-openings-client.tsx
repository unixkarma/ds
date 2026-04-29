'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Loader2, Calendar as CalendarIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ApplyTemplateDialog } from '@/components/openings/apply-template-dialog'
import { formatTime } from '@/lib/utils'
import type { Opening, OpeningTemplate } from '@/types'

interface GenerateOpeningsClientProps {
  instructorId: string
  templates: OpeningTemplate[]
  upcomingOpenings: Opening[]
}

const DAY_LABELS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_LABELS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function statusBadge(status: Opening['status']) {
  if (status === 'booked') return <Badge variant="default" className="text-[10px] py-0 px-1.5">booked</Badge>
  if (status === 'blocked') return <Badge variant="secondary" className="text-[10px] py-0 px-1.5">blocked</Badge>
  return null
}

export function GenerateOpeningsClient({
  instructorId,
  templates,
  upcomingOpenings,
}: GenerateOpeningsClientProps) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [preselectedDate, setPreselectedDate] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Build the 14-day window starting today
  const days = useMemo(() => {
    const out: Date[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    for (let i = 0; i < 14; i++) {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      out.push(d)
    }
    return out
  }, [])

  // Group openings by date key
  const openingsByDate = useMemo(() => {
    const map = new Map<string, Opening[]>()
    for (const o of upcomingOpenings) {
      const key = toDateKey(new Date(o.scheduled_at))
      const list = map.get(key) ?? []
      list.push(o)
      map.set(key, list)
    }
    return map
  }, [upcomingOpenings])

  function handleApplyForDate(dateKey: string) {
    setPreselectedDate(dateKey)
    setDialogOpen(true)
  }

  function handleApplyMultiple() {
    setPreselectedDate(null)
    setDialogOpen(true)
  }

  async function handleDelete(opening: Opening) {
    if (opening.status === 'booked') {
      toast.error('Cannot delete a booked opening. Cancel the lesson first.')
      return
    }
    setDeletingId(opening.id)
    const res = await fetch(`/api/openings/${opening.id}`, { method: 'DELETE' })
    setDeletingId(null)
    if (res.ok) {
      toast.success('Opening removed')
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? 'Failed to delete opening')
    }
  }

  if (templates.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          You don&apos;t have any templates yet. Switch to <span className="font-medium">My Templates</span>{' '}
          and create one (or use a school default) before generating openings.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Next 14 days. Click <span className="font-medium">Apply</span> on a day to fill it with a template,
          or <span className="font-medium">Apply to multiple days</span> to do several at once.
        </p>
        <Button variant="outline" onClick={handleApplyMultiple}>
          <CalendarIcon className="mr-2 h-4 w-4" />
          Apply to multiple days
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {days.map(d => {
          const key = toDateKey(d)
          const openings = openingsByDate.get(key) ?? []
          const isToday = key === toDateKey(new Date())

          return (
            <Card key={key} className={isToday ? 'border-primary/40 ring-1 ring-primary/20' : ''}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">
                      {DAY_LABELS_SHORT[d.getDay()]}
                    </div>
                    <div className="text-base font-semibold">
                      {MONTH_LABELS_SHORT[d.getMonth()]} {d.getDate()}
                    </div>
                  </div>
                  {isToday && <Badge variant="outline" className="text-[10px]">today</Badge>}
                </div>

                {openings.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No openings yet</p>
                ) : (
                  <ul className="space-y-1">
                    {openings.map(o => {
                      const start = new Date(o.scheduled_at)
                      const hh = String(start.getHours()).padStart(2, '0')
                      const mm = String(start.getMinutes()).padStart(2, '0')
                      const isBooked = o.status === 'booked'
                      return (
                        <li key={o.id} className="flex items-center justify-between gap-1 text-xs">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-medium tabular-nums">{formatTime(`${hh}:${mm}`)}</span>
                            <span className="text-muted-foreground">· {o.duration_minutes}m</span>
                            {statusBadge(o.status)}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                            disabled={isBooked || deletingId === o.id}
                            onClick={() => handleDelete(o)}
                            title={isBooked ? 'Cancel the lesson first' : 'Remove opening'}
                          >
                            {deletingId === o.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                          </Button>
                        </li>
                      )
                    })}
                  </ul>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-7 text-xs"
                  onClick={() => handleApplyForDate(key)}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Apply
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <ApplyTemplateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        templates={templates}
        instructorId={instructorId}
        days={days}
        preselectedDate={preselectedDate}
        onApplied={() => router.refresh()}
      />
    </div>
  )
}
