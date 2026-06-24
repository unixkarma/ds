'use client'

import { useState, useMemo } from 'react'
import { parseISO, startOfDay, endOfDay, format } from 'date-fns'
import { DollarSign, CreditCard, TrendingUp, Package as PackageIcon, Wallet, Download } from 'lucide-react'
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
import type {
  PaymentWithRelations,
  StudentPurchaseWithRelations,
} from '@/types'

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  card: 'Card',
  us_bank_account: 'Bank transfer',
  cashapp: 'Cash App',
  link: 'Link',
  klarna: 'Klarna',
  affirm: 'Affirm',
  afterpay_clearpay: 'Afterpay',
  cash: 'Cash',
  check: 'Check',
  other: 'Other',
}

function methodLabel(method: string | null): string {
  if (!method) return 'Unknown'
  return PAYMENT_METHOD_LABEL[method] ?? method.replace(/_/g, ' ')
}

// Effective price owed for a sale (price minus any discount).
function effectiveCents(p: StudentPurchaseWithRelations): number {
  return p.price_cents - (p.discount_cents ?? 0)
}

function balanceCents(p: StudentPurchaseWithRelations): number {
  return Math.max(0, effectiveCents(p) - p.amount_paid_cents)
}

type SaleStatus = 'Paid' | 'Partial' | 'Unpaid'

function saleStatus(p: StudentPurchaseWithRelations): SaleStatus {
  if (balanceCents(p) <= 0) return 'Paid'
  if (p.amount_paid_cents > 0) return 'Partial'
  return 'Unpaid'
}

const SALE_STATUS_BADGE: Record<SaleStatus, 'default' | 'secondary' | 'destructive'> = {
  Paid: 'default',
  Partial: 'secondary',
  Unpaid: 'destructive',
}

function soldByLabel(p: StudentPurchaseWithRelations): string {
  switch (p.sold_by) {
    case 'online':
      return 'Online'
    case 'operator':
      return 'Operator'
    case 'instructor':
      return p.sold_by_instructor ? getFullName(p.sold_by_instructor.user) : 'Instructor'
    default:
      return '—'
  }
}

interface RevenueReportProps {
  payments: PaymentWithRelations[]
  purchases: StudentPurchaseWithRelations[]
}

export function RevenueReport({ payments, purchases }: RevenueReportProps) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Most recent payment per (student, package) — used to surface a payment date
  // and method against each sale row. A sale paid over several installments
  // shows its latest payment.
  const paymentByPurchase = useMemo(() => {
    const map = new Map<string, PaymentWithRelations>()
    for (const pay of payments) {
      const key = `${pay.student_id}|${pay.package_id ?? 'none'}`
      const existing = map.get(key)
      if (!existing || parseISO(pay.created_at) > parseISO(existing.created_at)) {
        map.set(key, pay)
      }
    }
    return map
  }, [payments])

  const paymentForPurchase = (p: StudentPurchaseWithRelations) =>
    paymentByPurchase.get(`${p.student_id}|${p.package_id ?? 'none'}`) ?? null

  const inRange = (iso: string) => {
    const date = parseISO(iso)
    if (startDate && date < startOfDay(parseISO(startDate))) return false
    if (endDate && date > endOfDay(parseISO(endDate))) return false
    return true
  }

  // Actual money collected → payments. Sales / balances → purchases.
  const filteredPayments = useMemo(
    () => payments.filter((p) => inRange(p.created_at)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [payments, startDate, endDate]
  )
  const filteredPurchases = useMemo(
    () => purchases.filter((p) => inRange(p.created_at)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [purchases, startDate, endDate]
  )

  const completedPayments = filteredPayments.filter((p) => p.status === 'completed')
  const totalCents = completedPayments.reduce((sum, p) => sum + p.amount_cents, 0)
  const avgCents = completedPayments.length > 0
    ? Math.round(totalCents / completedPayments.length)
    : 0
  const pendingBalanceCents = filteredPurchases.reduce((sum, p) => sum + balanceCents(p), 0)

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
    const columns: CSVColumn<StudentPurchaseWithRelations>[] = [
      { header: 'Sale Date', value: (p) => format(parseISO(p.created_at), 'yyyy-MM-dd') },
      {
        header: 'Payment Date',
        value: (p) => {
          const pay = paymentForPurchase(p)
          return pay ? format(parseISO(pay.created_at), 'yyyy-MM-dd') : ''
        },
      },
      { header: 'Student', value: (p) => getFullName(p.student.user) },
      { header: 'Email', value: (p) => p.student.user.email ?? '' },
      { header: 'Package', value: (p) => p.package_name },
      { header: 'Sold By', value: (p) => soldByLabel(p) },
      { header: 'Payment Method', value: (p) => methodLabel(paymentForPurchase(p)?.payment_method ?? null) },
      { header: 'Price', value: (p) => (p.price_cents / 100).toFixed(2) },
      { header: 'Discount', value: (p) => ((p.discount_cents ?? 0) / 100).toFixed(2) },
      { header: 'Amount Paid', value: (p) => (p.amount_paid_cents / 100).toFixed(2) },
      { header: 'Balance', value: (p) => (balanceCents(p) / 100).toFixed(2) },
      { header: 'Status', value: (p) => saleStatus(p) },
    ]
    const csv = toCSV(filteredPurchases, columns)
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
          disabled={filteredPurchases.length === 0}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
            <p className="text-2xl font-bold">{filteredPayments.length}</p>
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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Balance</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(pendingBalanceCents)}</p>
            <p className="text-xs text-muted-foreground mt-1">Owed across sales in range</p>
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

      {/* Detailed table — one row per sale (package purchase) */}
      {filteredPurchases.length === 0 ? (
        <div className="flex items-center justify-center py-16 border rounded-lg">
          <p className="text-sm text-muted-foreground">No sales match the selected filters.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sale date</TableHead>
                <TableHead>Payment date</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Package</TableHead>
                <TableHead>Sold by</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Discount</TableHead>
                <TableHead className="text-right">Amount paid</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPurchases.map(purchase => {
                const balance = balanceCents(purchase)
                const status = saleStatus(purchase)
                const payment = paymentForPurchase(purchase)
                return (
                  <TableRow key={purchase.id}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatDate(purchase.created_at)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {payment ? formatDate(payment.created_at) : '—'}
                    </TableCell>
                    <TableCell className="font-medium">
                      {getFullName(purchase.student.user)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {purchase.package_name}
                    </TableCell>
                    <TableCell className="text-sm">{soldByLabel(purchase)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {payment ? methodLabel(payment.payment_method) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(purchase.price_cents)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {purchase.discount_cents > 0 ? `−${formatCurrency(purchase.discount_cents)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(purchase.amount_paid_cents)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {balance > 0 ? (
                        <span className="text-amber-600">{formatCurrency(balance)}</span>
                      ) : (
                        <span className="text-muted-foreground">{formatCurrency(0)}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={SALE_STATUS_BADGE[status]}>{status}</Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
