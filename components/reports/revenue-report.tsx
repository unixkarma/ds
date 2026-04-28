'use client'

import { useState, useMemo } from 'react'
import { parseISO, startOfDay, endOfDay, format } from 'date-fns'
import { DollarSign, CreditCard, TrendingUp, Package as PackageIcon, Copy, Check, Download } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency, formatDate, getFullName } from '@/lib/utils'
import { toCSV, downloadCSV, type CSVColumn } from '@/lib/csv'
import type { PaymentWithRelations, PaymentStatus } from '@/types'

const STATUS_BADGE: Record<PaymentStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline',
  completed: 'default',
  refunded: 'secondary',
  failed: 'destructive',
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  card: 'Card',
  us_bank_account: 'Bank transfer',
  cashapp: 'Cash App',
  link: 'Link',
  klarna: 'Klarna',
  affirm: 'Affirm',
  afterpay_clearpay: 'Afterpay',
}

function methodLabel(method: string | null): string {
  if (!method) return 'Unknown'
  return PAYMENT_METHOD_LABEL[method] ?? method.replace(/_/g, ' ')
}

function methodDisplay(payment: PaymentWithRelations): string {
  if (payment.payment_method === 'card' && payment.card_brand && payment.card_last4) {
    const brand = payment.card_brand.charAt(0).toUpperCase() + payment.card_brand.slice(1)
    return `${brand} •••• ${payment.card_last4}`
  }
  return methodLabel(payment.payment_method)
}

interface StripeIdProps {
  id: string
}

function StripeId({ id }: StripeIdProps) {
  const [copied, setCopied] = useState(false)

  if (!id) return <span className="text-muted-foreground">—</span>

  const truncated = id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id

  const onCopy = async () => {
    await navigator.clipboard.writeText(id)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-2 font-mono text-xs gap-1.5"
      onClick={onCopy}
      title={id}
    >
      {truncated}
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3 opacity-60" />}
    </Button>
  )
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

  const byPackage = useMemo(() => {
    const map = new Map<string, { name: string; count: number; totalCents: number }>()
    for (const p of completedPayments) {
      const key = p.package?.id ?? 'single'
      const name = p.package?.name ?? 'Single Lesson'
      const current = map.get(key) ?? { name, count: 0, totalCents: 0 }
      current.count += 1
      current.totalCents += p.amount_cents
      map.set(key, current)
    }
    return Array.from(map.values()).sort((a, b) => b.totalCents - a.totalCents)
  }, [completedPayments])

  const byMethod = useMemo(() => {
    const map = new Map<string, { label: string; count: number; totalCents: number }>()
    for (const p of completedPayments) {
      const key = p.payment_method ?? 'unknown'
      const label = methodLabel(p.payment_method)
      const current = map.get(key) ?? { label, count: 0, totalCents: 0 }
      current.count += 1
      current.totalCents += p.amount_cents
      map.set(key, current)
    }
    return Array.from(map.values()).sort((a, b) => b.totalCents - a.totalCents)
  }, [completedPayments])

  const handleExport = () => {
    const columns: CSVColumn<PaymentWithRelations>[] = [
      { header: 'Date', value: p => format(parseISO(p.created_at), 'yyyy-MM-dd HH:mm') },
      { header: 'Student', value: p => getFullName(p.student.user) },
      { header: 'Email', value: p => p.student.user.email ?? '' },
      { header: 'Package', value: p => p.package?.name ?? 'Single Lesson' },
      { header: 'Method', value: p => methodLabel(p.payment_method) },
      { header: 'Card Brand', value: p => p.card_brand ?? '' },
      { header: 'Card Last4', value: p => p.card_last4 ?? '' },
      { header: 'Stripe Payment Intent', value: p => p.stripe_payment_intent_id },
      { header: 'Amount', value: p => (p.amount_cents / 100).toFixed(2) },
      { header: 'Status', value: p => p.status },
    ]
    const csv = toCSV(filtered, columns)
    const today = format(new Date(), 'yyyy-MM-dd')
    downloadCSV(`revenue-${today}.csv`, csv)
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end justify-between">
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
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={filtered.length === 0}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
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

      {/* Breakdown: by package + by method */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Sales by package</CardTitle>
            <PackageIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-2">
            {byPackage.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No completed sales in range.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Package</TableHead>
                    <TableHead className="text-right">Sold</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byPackage.map(row => (
                    <TableRow key={row.name}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right">{row.count}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(row.totalCents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Sales by payment method</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-2">
            {byMethod.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No completed sales in range.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byMethod.map(row => (
                    <TableRow key={row.label}>
                      <TableCell className="font-medium">{row.label}</TableCell>
                      <TableCell className="text-right">{row.count}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(row.totalCents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detailed table */}
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
                <TableHead>Method</TableHead>
                <TableHead>Stripe ID</TableHead>
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
                  <TableCell className="text-sm">{methodDisplay(payment)}</TableCell>
                  <TableCell>
                    <StripeId id={payment.stripe_payment_intent_id} />
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
