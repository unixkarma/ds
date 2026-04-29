'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Sun, Sunset, CalendarRange, Calendar as CalendarIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { formatTime } from '@/lib/utils'
import type { OpeningTemplate } from '@/types'

const DAY_LABELS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_LABELS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function templateIcon(name: string) {
  const lower = name.toLowerCase()
  if (lower.includes('morning'))   return <Sun className="h-3.5 w-3.5" />
  if (lower.includes('afternoon')) return <Sunset className="h-3.5 w-3.5" />
  if (lower.includes('full day') || lower.includes('full-day')) return <CalendarRange className="h-3.5 w-3.5" />
  return <CalendarIcon className="h-3.5 w-3.5" />
}

interface SkipReport {
  date: string
  start: string
  reason: string
}

interface ApplyTemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templates: OpeningTemplate[]
  instructorId: string
  days: Date[]                     // 14-day window from parent
  preselectedDate: string | null   // YYYY-MM-DD or null
  onApplied: () => void
}

export function ApplyTemplateDialog({
  open,
  onOpenChange,
  templates,
  instructorId,
  days,
  preselectedDate,
  onApplied,
}: ApplyTemplateDialogProps) {
  const [templateId, setTemplateId] = useState<string>('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ created: number; skipped: SkipReport[] } | null>(null)

  // Reset state on open / preselection change
  useEffect(() => {
    if (open) {
      setTemplateId(templates[0]?.id ?? '')
      const init = new Set<string>()
      if (preselectedDate) init.add(preselectedDate)
      setSelected(init)
      setError(null)
      setResult(null)
      setSubmitting(false)
    }
  }, [open, preselectedDate, templates])

  function toggleDate(key: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(days.map(toDateKey)))
  }

  function clearAll() {
    setSelected(new Set())
  }

  async function handleSubmit() {
    if (!templateId) {
      setError('Pick a template first.')
      return
    }
    if (selected.size === 0) {
      setError('Pick at least one date.')
      return
    }

    setSubmitting(true)
    setError(null)
    const res = await fetch('/api/openings/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateId,
        instructorId,
        dates: Array.from(selected).sort(),
      }),
    })
    setSubmitting(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Failed to generate openings')
      return
    }

    const data = await res.json()
    const created = data.createdCount as number
    const skipped = (data.skipped ?? []) as SkipReport[]

    setResult({ created, skipped })

    if (skipped.length === 0) {
      toast.success(`Created ${created} opening${created === 1 ? '' : 's'}`)
      onApplied()
      onOpenChange(false)
    } else {
      toast.message(
        `Created ${created} · Skipped ${skipped.length}`,
        { description: 'See dialog for details.' }
      )
      onApplied()
      // keep dialog open so user can read the skipped reasons
    }
  }

  const selectedTemplate = useMemo(
    () => templates.find(t => t.id === templateId),
    [templates, templateId]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Apply Template</DialogTitle>
          <DialogDescription>
            Pick a template and the dates to fill. Slots that don&apos;t fit your availability or conflict with existing openings/lessons are skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Template picker */}
          <div className="space-y-1.5">
            <Label>Template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="flex items-center gap-2">
                      {templateIcon(t.name)}
                      {t.name}
                      <span className="text-muted-foreground text-xs">
                        ({t.slots.length} slot{t.slots.length === 1 ? '' : 's'})
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedTemplate && (
              <div className="flex flex-wrap gap-1 pt-1">
                {selectedTemplate.slots.map((s, i) => (
                  <Badge key={i} variant="outline" className="font-normal text-[10px]">
                    {formatTime(s.start)} · {s.duration_min}m
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Date picker */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Dates ({selected.size} selected)</Label>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={selectAll}>
                  All
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={clearAll}>
                  None
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map(d => {
                const key = toDateKey(d)
                const isSelected = selected.has(key)
                return (
                  <button
                    type="button"
                    key={key}
                    onClick={() => toggleDate(key)}
                    className={`flex flex-col items-center justify-center rounded-md border px-1 py-1.5 text-xs transition-colors ${
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input hover:border-primary/50 hover:bg-accent'
                    }`}
                  >
                    <span className="text-[9px] uppercase opacity-70">{DAY_LABELS_SHORT[d.getDay()]}</span>
                    <span className="font-semibold tabular-nums">{d.getDate()}</span>
                    <span className="text-[9px] opacity-70">{MONTH_LABELS_SHORT[d.getMonth()]}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Skipped report */}
          {result && result.skipped.length > 0 && (
            <Alert>
              <AlertDescription className="space-y-1.5">
                <div className="text-sm font-medium">
                  {result.created} created · {result.skipped.length} skipped
                </div>
                <ul className="text-xs space-y-0.5 max-h-32 overflow-y-auto">
                  {result.skipped.map((s, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="font-mono tabular-nums">{s.date}</span>
                      <span className="font-mono tabular-nums">{s.start}</span>
                      <span className="text-muted-foreground">— {s.reason}</span>
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          {!result && (
            <Button type="button" onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Generate
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
