'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarOff, Check, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { DayOffRequest } from '@/lib/services/days-off'
import type { DayOffStatus } from '@/types'

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const statusVariant: Record<DayOffStatus, 'default' | 'outline' | 'destructive'> = {
  pending: 'outline',
  approved: 'default',
  rejected: 'destructive',
}

const statusLabel: Record<DayOffStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
}

function formatDate(d: string): string {
  const date = new Date(d + 'T00:00:00')
  return `${DAY_SHORT[date.getDay()]} · ${MONTH_SHORT[date.getMonth()]} ${date.getDate()}`
}

interface DaysOffTableProps {
  requests: DayOffRequest[]
}

export function DaysOffTable({ requests }: DaysOffTableProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [statusFilter, setStatusFilter] = useState<string>('pending')
  const [actingId, setActingId] = useState<string | null>(null)

  const pendingCount = requests.filter((r) => r.status === 'pending').length

  const filtered = requests.filter(
    (r) => statusFilter === 'all' || r.status === statusFilter
  )

  async function review(req: DayOffRequest, status: 'approved' | 'rejected') {
    setActingId(req.id)
    const res = await fetch(`/api/instructor-days-off/${req.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setActingId(null)

    if (res.ok) {
      toast.success(
        status === 'approved'
          ? `Day off approved for ${req.instructor_name}`
          : `Day off rejected for ${req.instructor_name}`
      )
      startTransition(() => router.refresh())
    } else {
      const data = await res.json()
      toast.error(data.error ?? 'Failed to update request')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending ({pendingCount})</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border rounded-lg">
          <CalendarOff className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground text-sm">
            {statusFilter === 'pending'
              ? 'No pending day-off requests.'
              : 'No requests match this filter.'}
          </p>
        </div>
      ) : (
        <div className="rounded-md border divide-y">
          {filtered.map((req) => (
            <div
              key={req.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{req.instructor_name}</span>
                  <Badge variant={statusVariant[req.status]} className="text-[10px]">
                    {statusLabel[req.status]}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground mt-0.5">
                  <span className="tabular-nums">{formatDate(req.date)}</span>
                  {req.reason && <span className="ml-2">· {req.reason}</span>}
                </div>
              </div>

              {req.status === 'pending' ? (
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => review(req, 'rejected')}
                    disabled={actingId === req.id}
                    className="text-destructive hover:text-destructive"
                  >
                    {actingId === req.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <X className="h-3.5 w-3.5 mr-1" />
                    )}
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => review(req, 'approved')}
                    disabled={actingId === req.id}
                  >
                    {actingId === req.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5 mr-1" />
                    )}
                    Approve
                  </Button>
                </div>
              ) : (
                // Approved/rejected rows can still be flipped if the admin changes their mind.
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    review(req, req.status === 'approved' ? 'rejected' : 'approved')
                  }
                  disabled={actingId === req.id}
                  className="shrink-0 text-muted-foreground"
                >
                  {actingId === req.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : req.status === 'approved' ? (
                    'Undo (reject)'
                  ) : (
                    'Approve instead'
                  )}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
