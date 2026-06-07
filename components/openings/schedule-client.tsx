'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Pencil, Trash2, Plus, Lock, Sun, Sunset, CalendarRange, Calendar,
  Loader2, X, Copy,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { TemplateDialog } from '@/components/openings/template-dialog'
import { formatTimeRange } from '@/lib/utils'
import type {
  InstructorDayOff,
  Opening,
  OpeningTemplate,
} from '@/types'

// ── Helpers ──
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]
const DAY_SHORT: Record<number, string> = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' }
const DAY_SHORT_ARR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const BUFFER_OPTIONS = [
  { value: '0', label: 'No buffer' },
  { value: '5', label: '5 min' },
  { value: '10', label: '10 min' },
  { value: '15', label: '15 min' },
  { value: '20', label: '20 min' },
  { value: '30', label: '30 min' },
]

function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function templateIcon(name: string) {
  const lower = name.toLowerCase()
  if (lower.includes('morning'))   return <Sun className="h-4 w-4" />
  if (lower.includes('afternoon')) return <Sunset className="h-4 w-4" />
  if (lower.includes('full day') || lower.includes('full-day')) return <CalendarRange className="h-4 w-4" />
  return <Calendar className="h-4 w-4" />
}

function formatDayList(days: number[]): string {
  if (!days || days.length === 0) return 'No days'
  if (days.length === 7) return 'Every day'
  // Detect Mon-Fri
  const sorted = [...days].sort()
  if (sorted.length === 5 && sorted.join(',') === '1,2,3,4,5') return 'Mon–Fri'
  if (sorted.length === 2 && sorted.join(',') === '0,6') return 'Weekends'
  return DAY_ORDER.filter(d => days.includes(d)).map(d => DAY_SHORT[d]).join(' · ')
}

// ── TemplateCard ──
function TemplateCard({
  template,
  readOnly,
  onEdit,
  onDelete,
  onUseAsStarter,
}: {
  template: OpeningTemplate
  readOnly: boolean
  onEdit?: () => void
  onDelete?: () => void
  onUseAsStarter?: () => void
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-muted-foreground shrink-0">{templateIcon(template.name)}</div>
            <CardTitle className="text-base truncate">{template.name}</CardTitle>
          </div>
          {readOnly ? (
            <Badge variant="secondary" className="shrink-0 text-xs">
              <Lock className="h-3 w-3 mr-1" />
              Starter
            </Badge>
          ) : (
            <div className="flex gap-1 shrink-0">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
        <CardDescription className="text-xs flex items-center gap-1.5">
          <span className="font-medium">{formatDayList(template.day_of_week ?? [])}</span>
          <span>·</span>
          <span>{template.slots.length} {template.slots.length === 1 ? 'slot' : 'slots'} per day</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {template.slots.map((slot, i) => (
            <Badge key={i} variant="outline" className="font-normal">
              {formatTimeRange(slot.start, slot.duration_min)}
            </Badge>
          ))}
        </div>
        {readOnly && onUseAsStarter && (
          <Button variant="outline" size="sm" className="w-full" onClick={onUseAsStarter}>
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            Use this template
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

// ── Main client ──
interface ScheduleClientProps {
  instructorId: string
  bufferMinutes: number
  schoolDefaults: OpeningTemplate[]
  ownTemplates: OpeningTemplate[]
  daysOff: InstructorDayOff[]
  upcomingOpenings: Opening[]
}

export function ScheduleClient({
  instructorId,
  bufferMinutes,
  schoolDefaults,
  ownTemplates,
  daysOff,
  upcomingOpenings,
}: ScheduleClientProps) {
  const router = useRouter()

  // Templates dialog state
  const [tplDialogOpen, setTplDialogOpen] = useState(false)
  const [editingTpl, setEditingTpl] = useState<OpeningTemplate | null>(null)
  const [prefillTpl, setPrefillTpl] = useState<OpeningTemplate | null>(null)
  const [deletingTpl, setDeletingTpl] = useState<OpeningTemplate | null>(null)
  const [isDeletingTpl, setIsDeletingTpl] = useState(false)

  // Days off form state
  const [newDayOffDate, setNewDayOffDate] = useState('')
  const [newDayOffReason, setNewDayOffReason] = useState('')
  const [submittingDayOff, setSubmittingDayOff] = useState(false)
  const [removingDayOffId, setRemovingDayOffId] = useState<string | null>(null)

  // Opening delete state
  const [removingOpeningId, setRemovingOpeningId] = useState<string | null>(null)

  // Buffer state
  const [bufferValue, setBufferValue] = useState(String(bufferMinutes))
  const [savingBuffer, setSavingBuffer] = useState(false)

  function handleNewTpl() {
    setEditingTpl(null)
    setPrefillTpl(null)
    setTplDialogOpen(true)
  }

  function handleEditTpl(t: OpeningTemplate) {
    setEditingTpl(t)
    setPrefillTpl(null)
    setTplDialogOpen(true)
  }

  function handleUseStarter(t: OpeningTemplate) {
    setEditingTpl(null)
    setPrefillTpl(t)
    setTplDialogOpen(true)
  }

  async function handleDeleteTpl() {
    if (!deletingTpl) return
    setIsDeletingTpl(true)
    const res = await fetch(`/api/opening-templates/${deletingTpl.id}`, { method: 'DELETE' })
    setIsDeletingTpl(false)
    if (res.ok) {
      toast.success('Template removed and openings regenerated')
      setDeletingTpl(null)
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? 'Failed to delete template')
    }
  }

  async function handleAddDayOff() {
    if (!newDayOffDate) {
      toast.error('Pick a date first')
      return
    }
    setSubmittingDayOff(true)
    const res = await fetch('/api/instructor-days-off', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: newDayOffDate,
        reason: newDayOffReason || undefined,
      }),
    })
    setSubmittingDayOff(false)
    if (res.ok) {
      toast.success('Day off requested — pending admin approval')
      setNewDayOffDate('')
      setNewDayOffReason('')
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? 'Failed to add day off')
    }
  }

  async function handleRemoveDayOff(id: string) {
    setRemovingDayOffId(id)
    const res = await fetch(`/api/instructor-days-off/${id}`, { method: 'DELETE' })
    setRemovingDayOffId(null)
    if (res.ok) {
      toast.success('Day off removed — openings restored')
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? 'Failed to remove day off')
    }
  }

  async function handleRemoveOpening(o: Opening) {
    if (o.status === 'booked') {
      toast.error('Cannot remove a booked opening. Cancel the lesson first.')
      return
    }
    setRemovingOpeningId(o.id)
    const res = await fetch(`/api/openings/${o.id}`, { method: 'DELETE' })
    setRemovingOpeningId(null)
    if (res.ok) {
      toast.success('Opening removed')
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? 'Failed to remove opening')
    }
  }

  async function handleSaveBuffer() {
    setSavingBuffer(true)
    const res = await fetch(`/api/instructors/${instructorId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bufferMinutes: parseInt(bufferValue, 10) }),
    })
    setSavingBuffer(false)
    if (res.ok) {
      toast.success('Buffer updated')
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? 'Failed to update buffer')
    }
  }

  // Build 14-day preview
  const upcomingDays: Date[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let i = 0; i < 14; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    upcomingDays.push(d)
  }
  const openingsByDay = new Map<string, Opening[]>()
  for (const o of upcomingOpenings) {
    const key = toDateKey(new Date(o.scheduled_at))
    const list = openingsByDay.get(key) ?? []
    list.push(o)
    openingsByDay.set(key, list)
  }
  // Only approved days off actually block the calendar; pending requests don't yet.
  const daysOffSet = new Set(daysOff.filter(d => d.status === 'approved').map(d => d.date))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Availability</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Define your week and the system auto-generates bookable openings for the next 14 days.
        </p>
      </div>

      <Tabs defaultValue="templates">
        <TabsList>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="days-off">
            Days Off{daysOff.length > 0 && <span className="ml-1 text-muted-foreground">({daysOff.length})</span>}
          </TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming Openings</TabsTrigger>
        </TabsList>

        {/* ─────────── Tab 1: Templates ─────────── */}
        <TabsContent value="templates" className="space-y-6 pt-2">
          <div className="flex items-center justify-end">
            <Button onClick={handleNewTpl}>
              <Plus className="mr-2 h-4 w-4" />
              New Template
            </Button>
          </div>

          {schoolDefaults.length > 0 && (
            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Starters
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Recipes from your school. They don&apos;t apply automatically — click{' '}
                  <span className="font-medium">Use this template</span> to copy one as your own.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {schoolDefaults.map(t => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    readOnly
                    onUseAsStarter={() => handleUseStarter(t)}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              My custom templates
            </h2>
            {ownTemplates.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No custom templates yet. Use a school default above, or click{' '}
                  <span className="font-medium">New Template</span> to create your own.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {ownTemplates.map(t => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    readOnly={false}
                    onEdit={() => handleEditTpl(t)}
                    onDelete={() => setDeletingTpl(t)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Preferences (buffer) */}
          <section className="space-y-3 pt-4 border-t">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Preferences
            </h2>
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Buffer between lessons</p>
                    <p className="text-xs text-muted-foreground">
                      Travel time between locations. Slots are spaced accordingly.
                    </p>
                  </div>
                  <Select value={bufferValue} onValueChange={setBufferValue}>
                    <SelectTrigger className="w-full sm:w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BUFFER_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleSaveBuffer}
                    disabled={savingBuffer || bufferValue === String(bufferMinutes)}
                    size="sm"
                  >
                    {savingBuffer && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    Save
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>
        </TabsContent>

        {/* ─────────── Tab 2: Days Off ─────────── */}
        <TabsContent value="days-off" className="space-y-4 pt-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Request a day off</CardTitle>
              <CardDescription>
                Vacation, sick day, holiday — anything. Your request is sent to the admin for
                approval; openings on that date are only removed once it&apos;s approved.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-2 items-end">
                <div className="flex-1 space-y-1.5 w-full">
                  <Label htmlFor="day-off-date">Date</Label>
                  <Input
                    id="day-off-date"
                    type="date"
                    value={newDayOffDate}
                    min={toDateKey(today)}
                    onChange={(e) => setNewDayOffDate(e.target.value)}
                  />
                </div>
                <div className="flex-1 space-y-1.5 w-full">
                  <Label htmlFor="day-off-reason">Reason (optional)</Label>
                  <Input
                    id="day-off-reason"
                    placeholder="e.g. Doctor"
                    value={newDayOffReason}
                    onChange={(e) => setNewDayOffReason(e.target.value)}
                    maxLength={120}
                  />
                </div>
                <Button onClick={handleAddDayOff} disabled={submittingDayOff || !newDayOffDate}>
                  {submittingDayOff && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>

          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Upcoming days off
            </h2>
            {daysOff.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No days off scheduled.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-1.5">
                {daysOff.map(d => {
                  const date = new Date(d.date + 'T00:00:00')
                  return (
                    <div
                      key={d.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border bg-card"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="text-sm font-medium tabular-nums">
                          {DAY_SHORT_ARR[date.getDay()]} · {MONTH_SHORT[date.getMonth()]} {date.getDate()}
                        </div>
                        <Badge
                          variant={
                            d.status === 'approved'
                              ? 'default'
                              : d.status === 'rejected'
                              ? 'destructive'
                              : 'outline'
                          }
                          className="text-[10px] capitalize"
                        >
                          {d.status}
                        </Badge>
                        {d.reason && (
                          <span className="text-xs text-muted-foreground truncate">{d.reason}</span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveDayOff(d.id)}
                        disabled={removingDayOffId === d.id}
                      >
                        {removingDayOffId === d.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <X className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </TabsContent>

        {/* ─────────── Tab 3: Upcoming Openings ─────────── */}
        <TabsContent value="upcoming" className="pt-2">
          <p className="text-sm text-muted-foreground mb-3">
            Auto-generated from your templates and days off. Remove individual slots if needed; the system won&apos;t recreate them
            until you change a template or remove a day off.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
            {upcomingDays.map(d => {
              const key = toDateKey(d)
              const isOff = daysOffSet.has(key)
              const dayOpenings = openingsByDay.get(key) ?? []
              const isToday = key === toDateKey(new Date())

              return (
                <Card
                  key={key}
                  className={
                    isOff
                      ? 'border-muted bg-muted/30'
                      : isToday
                        ? 'border-primary/40 ring-1 ring-primary/20'
                        : ''
                  }
                >
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">
                          {DAY_SHORT_ARR[d.getDay()]}
                        </div>
                        <div className="text-base font-semibold">
                          {MONTH_SHORT[d.getMonth()]} {d.getDate()}
                        </div>
                      </div>
                      {isToday && <Badge variant="outline" className="text-[10px]">today</Badge>}
                      {isOff && <Badge variant="secondary" className="text-[10px]">off</Badge>}
                    </div>

                    {isOff ? (
                      <p className="text-xs text-muted-foreground italic">Day off</p>
                    ) : dayOpenings.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No openings</p>
                    ) : (
                      <ul className="space-y-1">
                        {dayOpenings.map(o => {
                          const start = new Date(o.scheduled_at)
                          const hh = String(start.getHours()).padStart(2, '0')
                          const mm = String(start.getMinutes()).padStart(2, '0')
                          const isBooked = o.status === 'booked'
                          return (
                            <li key={o.id} className="flex items-center justify-between gap-1 text-xs">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="font-medium tabular-nums">
                                  {formatTimeRange(`${hh}:${mm}`, o.duration_minutes)}
                                </span>
                                {isBooked && (
                                  <Badge variant="default" className="text-[9px] py-0 px-1">booked</Badge>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                                disabled={isBooked || removingOpeningId === o.id}
                                onClick={() => handleRemoveOpening(o)}
                                title={isBooked ? 'Cancel the lesson first' : 'Remove'}
                              >
                                {removingOpeningId === o.id ? (
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
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>
      </Tabs>

      <TemplateDialog
        open={tplDialogOpen}
        onOpenChange={setTplDialogOpen}
        template={editingTpl}
        prefillFrom={prefillTpl}
        bufferMinutes={bufferMinutes}
        onSaved={() => router.refresh()}
      />

      <AlertDialog open={!!deletingTpl} onOpenChange={(open) => !open && setDeletingTpl(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deletingTpl?.name}&quot; will be removed. The system will regenerate your openings without it.
              Booked lessons are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingTpl}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTpl}
              disabled={isDeletingTpl}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isDeletingTpl ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
