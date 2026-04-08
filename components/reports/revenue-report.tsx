'use client'

import { useState, useMemo } from 'react'
import { parseISO, startOfDay, endOfDay } from 'date-fns'
import { DollarSign, CreditCard, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency, formatDate, getFullName } from '@/lib/utils'
import type { PaymentWithRelations, PaymentStatus } from '@/types'

const STATUS_BADGE: Record<PaymentStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline',
  completed: 'default',
  refunded: 'secondary',
  failed: 'destructive',
}

interface RevenueReportProps {
  payments: PaymentWithRelations[]
}

export function RevenueReport({ payments }: RevenueReportProps) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const filtered = useMemo(() => {
    return payments.filter(payment => {
      const date = parseISO(payment.created_at)
      if (startDate && date < startOfDay(parseISO(startDate))) return false
      if (endDate && date > endOfDay(parseISO(endDate))) return false
      return true
    })
  }, [payments, startDate, endDate])

  const completedPayments = filtered.filter(p => p.status === 'completed')
  const totalCents = completedPayments.reduce((sum, p) => sum + p.amount_cents, 0)
  const avgCents = completedPayments.length > 0
    ? Math.round(totalCents / completedPayments.length)
    : 0

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">From</label>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="h-9 px-3 rounded-md border border-input bg-background text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">To</label>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="h-9 px-3 rounded-md border border-input bg-background text-sm"
          />
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(totalCents)}</p>
            <p className="text-xs text-muted-foreground mt-1">From completed payments</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Payments</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{filtered.length}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {completedPayments.length} completed
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Payment</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(avgCents)}</p>
            <p className="text-xs text-muted-foreground mt-1">Per completed payment</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex items-center justify-center py-16 border rounded-lg">
          <p className="text-sm text-muted-foreground">No payments match the selected filters.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Package</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(payment => (
                <TableRow key={payment.id}>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(payment.created_at)}
                  </TableCell>
                  <TableCell className="font-medium">
                    {getFullName(payment.student.user)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {payment.package?.name ?? 'Single Lesson'}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(payment.amount_cents)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={STATUS_BADGE[payment.status]}>{payment.status}</Badge>
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
