'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2, Check, X, FileText } from 'lucide-react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency } from '@/lib/utils'
import type {
  InstructorAssignment,
  InstructorDeduction,
  InstructorReimbursement,
  DeductionType,
  ReimbursementStatus,
} from '@/types'

const DEDUCTION_LABEL: Record<DeductionType, string> = {
  car_insurance: 'Car insurance',
  personal_insurance: 'Personal insurance',
  other: 'Other',
}

const REIMBURSEMENT_BADGE: Record<ReimbursementStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline',
  approved: 'default',
  paid: 'secondary',
  rejected: 'destructive',
}

function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h}h`
  return `${m}m`
}

async function openEvidence(id: string) {
  const res = await fetch(`/api/reimbursements/${id}/evidence`)
  if (!res.ok) {
    toast.error('Could not load evidence')
    return
  }
  const data = await res.json()
  if (data.url) window.open(data.url, '_blank', 'noopener,noreferrer')
}

interface InstructorDetailTabsProps {
  instructorId: string
  overview: ReactNode
  assignments: InstructorAssignment[]
  deductions: InstructorDeduction[]
  reimbursements: InstructorReimbursement[]
}

export function InstructorDetailTabs({
  instructorId,
  overview,
  assignments,
  deductions,
  reimbursements,
}: InstructorDetailTabsProps) {
  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="assignments">Assignments</TabsTrigger>
        <TabsTrigger value="deductions">Deductions</TabsTrigger>
        <TabsTrigger value="reimbursements">Reimbursements</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-6 space-y-6">
        {overview}
      </TabsContent>

      <TabsContent value="assignments" className="mt-6">
        <AssignmentsTab instructorId={instructorId} assignments={assignments} />
      </TabsContent>

      <TabsContent value="deductions" className="mt-6">
        <DeductionsTab instructorId={instructorId} deductions={deductions} />
      </TabsContent>

      <TabsContent value="reimbursements" className="mt-6">
        <ReimbursementsTab instructorId={instructorId} reimbursements={reimbursements} />
      </TabsContent>
    </Tabs>
  )
}

// ── Assignments ──────────────────────────────────────────────
function AssignmentsTab({
  instructorId,
  assignments,
}: {
  instructorId: string
  assignments: InstructorAssignment[]
}) {
  const router = useRouter()
  const [scheduledAt, setScheduledAt] = useState('')
  const [hours, setHours] = useState('0')
  const [minutes, setMinutes] = useState('0')
  const [detail, setDetail] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleCreate() {
    const durationMinutes = Number(hours) * 60 + Number(minutes)
    if (!scheduledAt) return toast.error('Pick a date and time')
    if (durationMinutes <= 0) return toast.error('Duration must be greater than zero')

    setSaving(true)
    try {
      const res = await fetch(`/api/instructors/${instructorId}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduledAt: new Date(scheduledAt).toISOString(),
          durationMinutes,
          detail,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error ?? 'Failed to create assignment')
        return
      }
      toast.success('Assignment added')
      setScheduledAt(''); setHours('0'); setMinutes('0'); setDetail('')
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  async function setStatus(id: string, status: 'completed' | 'cancelled' | 'scheduled') {
    const res = await fetch(`/api/instructors/${instructorId}/assignments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) return toast.error('Update failed')
    toast.success('Assignment updated')
    router.refresh()
  }

  async function remove(id: string) {
    const res = await fetch(`/api/instructors/${instructorId}/assignments/${id}`, { method: 'DELETE' })
    if (!res.ok) return toast.error('Delete failed')
    toast.success('Assignment removed')
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New assignment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label className="text-xs text-muted-foreground font-medium">Date &amp; time</label>
              <Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">Hours</label>
              <Input type="number" min={0} value={hours} onChange={e => setHours(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">Minutes</label>
              <Input type="number" min={0} max={59} value={minutes} onChange={e => setMinutes(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">Detail</label>
            <Input value={detail} onChange={e => setDetail(e.target.value)} placeholder="What is this assignment?" />
          </div>
          <Button size="sm" onClick={handleCreate} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add assignment
          </Button>
        </CardContent>
      </Card>

      {assignments.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No assignments yet.</p>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-center">Duration</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Earning</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map(a => (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap">
                    {format(parseISO(a.scheduled_at), 'MMM d, yyyy · h:mm a')}
                  </TableCell>
                  <TableCell className="text-center">{durationLabel(a.duration_minutes)}</TableCell>
                  <TableCell className="text-muted-foreground">{a.detail || '—'}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={a.status === 'completed' ? 'default' : a.status === 'cancelled' ? 'outline' : 'secondary'}>
                      {a.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {a.earning_cents > 0 ? formatCurrency(a.earning_cents) : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {a.status !== 'completed' && (
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setStatus(a.id, 'completed')} title="Mark completed">
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {a.status !== 'cancelled' && (
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setStatus(a.id, 'cancelled')} title="Mark cancelled">
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive" onClick={() => remove(a.id)} title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

// ── Deductions ───────────────────────────────────────────────
function DeductionsTab({
  instructorId,
  deductions,
}: {
  instructorId: string
  deductions: InstructorDeduction[]
}) {
  const router = useRouter()
  const [date, setDate] = useState('')
  const [type, setType] = useState<DeductionType>('car_insurance')
  const [amount, setAmount] = useState('')
  const [detail, setDetail] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleCreate() {
    if (!date) return toast.error('Pick a date')
    const amountCents = Math.round(Number(amount) * 100)
    if (!Number.isFinite(amountCents) || amountCents < 0) return toast.error('Enter a valid amount')

    setSaving(true)
    try {
      const res = await fetch(`/api/instructors/${instructorId}/deductions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, type, amountCents, detail }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error ?? 'Failed to create deduction')
        return
      }
      toast.success('Deduction added')
      setDate(''); setType('car_insurance'); setAmount(''); setDetail('')
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/instructors/${instructorId}/deductions/${id}`, { method: 'DELETE' })
    if (!res.ok) return toast.error('Delete failed')
    toast.success('Deduction removed')
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New deduction</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">Date</label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">Type</label>
              <Select value={type} onValueChange={v => setType(v as DeductionType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="car_insurance">Car insurance</SelectItem>
                  <SelectItem value="personal_insurance">Personal insurance</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">Amount ($)</label>
              <Input type="number" min={0} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">Detail</label>
              <Input value={detail} onChange={e => setDetail(e.target.value)} placeholder="Optional note" />
            </div>
          </div>
          <Button size="sm" onClick={handleCreate} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add deduction
          </Button>
        </CardContent>
      </Card>

      {deductions.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No deductions yet.</p>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deductions.map(d => (
                <TableRow key={d.id}>
                  <TableCell className="whitespace-nowrap">{format(parseISO(d.date), 'MMM d, yyyy')}</TableCell>
                  <TableCell>{DEDUCTION_LABEL[d.type]}</TableCell>
                  <TableCell className="text-muted-foreground">{d.detail || '—'}</TableCell>
                  <TableCell className="text-right text-destructive">-{formatCurrency(d.amount_cents)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive" onClick={() => remove(d.id)} title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

// ── Reimbursements (admin review) ────────────────────────────
function ReimbursementsTab({
  instructorId,
  reimbursements,
}: {
  instructorId: string
  reimbursements: InstructorReimbursement[]
}) {
  const router = useRouter()

  async function setStatus(id: string, status: ReimbursementStatus) {
    const res = await fetch(`/api/instructors/${instructorId}/reimbursements/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) return toast.error('Update failed')
    toast.success('Reimbursement updated')
    router.refresh()
  }

  if (reimbursements.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No reimbursements submitted.</p>
  }

  return (
    <div className="border rounded-lg overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Detail</TableHead>
            <TableHead className="text-center">Status</TableHead>
            <TableHead className="text-center">Evidence</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reimbursements.map(r => (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap">{format(parseISO(r.date), 'MMM d, yyyy')}</TableCell>
              <TableCell className="text-muted-foreground">{r.detail || '—'}</TableCell>
              <TableCell className="text-center">
                <Badge variant={REIMBURSEMENT_BADGE[r.status]}>{r.status}</Badge>
              </TableCell>
              <TableCell className="text-center">
                {r.evidence_path ? (
                  <Button variant="ghost" size="sm" className="h-7 gap-1 px-2" onClick={() => openEvidence(r.id)}>
                    <FileText className="h-3.5 w-3.5" /> View
                  </Button>
                ) : (
                  <span className="text-muted-foreground text-xs">—</span>
                )}
              </TableCell>
              <TableCell className="text-right">{formatCurrency(r.amount_cents)}</TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  {r.status !== 'approved' && (
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setStatus(r.id, 'approved')} title="Approve">
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {r.status !== 'rejected' && (
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive" onClick={() => setStatus(r.id, 'rejected')} title="Reject">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {r.status !== 'paid' && (
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setStatus(r.id, 'paid')} title="Mark paid">
                      Paid
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
