'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { Loader2, Upload, Plus, FileText } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency } from '@/lib/utils'
import type { InstructorReimbursement, ReimbursementStatus } from '@/types'

const STATUS_BADGE: Record<ReimbursementStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline',
  approved: 'default',
  paid: 'secondary',
  rejected: 'destructive',
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

interface ReimbursementFormProps {
  reimbursements: InstructorReimbursement[]
}

export function ReimbursementForm({ reimbursements }: ReimbursementFormProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [date, setDate] = useState('')
  const [amount, setAmount] = useState('')
  const [detail, setDetail] = useState('')
  const [fileName, setFileName] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    if (!date) return toast.error('Pick a date')
    const amountCents = Math.round(Number(amount) * 100)
    if (!Number.isFinite(amountCents) || amountCents < 0) return toast.error('Enter a valid amount')

    const formData = new FormData()
    formData.append('date', date)
    formData.append('amountCents', String(amountCents))
    formData.append('detail', detail)
    const file = fileInputRef.current?.files?.[0]
    if (file) formData.append('file', file)

    setSaving(true)
    try {
      const res = await fetch('/api/instructor/reimbursements', { method: 'POST', body: formData })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error ?? 'Failed to submit reimbursement')
        return
      }
      toast.success('Reimbursement submitted')
      setDate(''); setAmount(''); setDetail(''); setFileName('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New reimbursement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">Date</label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">Amount ($)</label>
              <Input type="number" min={0} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground font-medium">Detail</label>
              <Input value={detail} onChange={e => setDetail(e.target.value)} placeholder="What is this for?" />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">Invoice / evidence</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={e => setFileName(e.target.files?.[0]?.name ?? '')}
              className="hidden"
            />
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-2">
                <Upload className="h-3.5 w-3.5" />
                {fileName ? 'Change file' : 'Attach file'}
              </Button>
              <span className="text-xs text-muted-foreground truncate">{fileName || 'JPEG, PNG, WebP or PDF · max 10 MB'}</span>
            </div>
          </div>

          <Button size="sm" onClick={handleSubmit} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Submit reimbursement
          </Button>
        </CardContent>
      </Card>

      {reimbursements.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No reimbursements submitted yet.</p>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center">Evidence</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reimbursements.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{format(parseISO(r.date), 'MMM d, yyyy')}</TableCell>
                  <TableCell className="text-muted-foreground">{r.detail || '—'}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={STATUS_BADGE[r.status]}>{r.status}</Badge>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
