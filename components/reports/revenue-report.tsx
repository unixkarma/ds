'use client'

import { useState, useMemo } from 'react'
import { parseISO, startOfDay, endOfDay, format } from 'date-fns'
import { DollarSign, CreditCard, TrendingUp, Package as PackageIcon, Wallet, Download, Receipt } from 'lucide-react'
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
import { cn, formatCurrency, formatDate, getFullName } from '@/lib/utils'
import { toCSV, downloadCSV, type CSVColumn } from '@/lib/csv'
import type {
  PaymentWithRelations,
  StudentPurchaseWithRelations,
  StudentLedgerEntryWithStudent,
} from '@/types'

const LEDGER_TYPE_LABEL: Record<StudentLedgerEntryWithStudent['entry_type'], string> = {
  charge: 'Charge',
  payment: 'Payment',
  adjustment: 'Adjustment',
}

const LEDGER_TYPE_BADGE: Record<
  StudentLedgerEntryWithStudent['entry_type'],
  'destructive' | 'default' | 'secondary'
> = {
  charge: 'destructive',
  payment: 'default',
  adjustment: 'secondary',
}

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
  ledger: StudentLedgerEntryWithStudent[]
  balances: Record<string, number>
}

export function RevenueReport({ payments, purchases, ledger, balances }: RevenueReportProps) {
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

  // Running balance after each ledger entry, computed over the FULL history per
  // student (unfiltered) so the "Balance" column stays meaningful even when a
  // date filter hides earlier rows. `ledger` arrives oldest-first.
  const balanceAfter = useMemo(() => {
    const running = new Map<string, number>()   // studentId → cumulative balance
    const result = new Map<string, number>()    // entryId   → balance after entry
    for (const e of ledger) {
      const next = (running.get(e.student_id) ?? 0) + e.amount_cents
      running.set(e.student_id, next)
      result.set(e.id, next)
    }
    return result
  }, [ledger])

  // Transactions to display: filtered by date, newest first.
  const filteredLedger = useMemo(
    () =>
      ledger
        .filter((e) => inRange(e.created_at))
        .sort((a, b) => parseISO(b.created_at).getTime() - parseISO(a.created_at).getTime()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ledger, startDate, endDate]
  )

  const completedPayments = filteredPayments.filter((p) => p.status === 'completed')
  const totalCents = completedPayments.reduce((sum, p) => sum + p.amount_cents, 0)
  const avgCents = completedPayments.length > 0
    ? Math.round(totalCents / completedPayments.length)
    : 0
  // Authoritative outstanding balance = sum of positive per-student ledger
  // balances. Unlike the old purchases-only figure, this includes manual
  // charges/credits/adjustments. Point-in-time (current), not date-filtered.
  const outstandingBalanceCents = Object.values(balances).reduce(
    (sum, b) => sum + Math.max(0, b),
    0
  )

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

  const handleExportTransactions = () => {
    const columns: CSVColumn<StudentLedgerEntryWithStudent>[] = [
      { header: 'Date', value: (e) => format(parseISO(e.created_at), 'yyyy-MM-dd') },
      { header: 'Student', value: (e) => getFullName(e.student.user) },
      { header: 'Email', value: (e) => e.student.user.email ?? '' },
      { header: 'Type', value: (e) => LEDGER_TYPE_LABEL[e.entry_type] },
      { header: 'Concept', value: (e) => e.description ?? '' },
      { header: 'Method', value: (e) => (e.payment_method ? methodLabel(e.payment_method) : '') },
      { header: 'Amount', value: (e) => (e.amount_cents / 100).toFixed(2) },
      {
        header: 'Balance After',
        value: (e) => ((balanceAfter.get(e.id) ?? 0) / 100).toFixed(2),
      },
    ]
    const csv = toCSV(filteredLedger, columns)
    const today = format(new Date(), 'yyyy-MM-dd')
    downloadCSV(`transactions-${today}.csv`, csv)
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding Balance</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(outstandingBalanceCents)}</p>
            <p className="text-xs text-muted-foreground mt-1">Owed now across all students</p>
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

      {/* Transactions — one row per ledger entry (charge / payment / adjustment).
          The authoritative money-balance journal: includes manual charges and
          credits that never appear as a package sale. */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Transactions</h3>
            <span className="text-xs text-muted-foreground">
              Every charge, payment and adjustment per student
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportTransactions}
            disabled={filteredLedger.length === 0}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>

        {filteredLedger.length === 0 ? (
          <div className="flex items-center justify-center py-16 border rounded-lg">
            <p className="text-sm text-muted-foreground">No transactions match the selected filters.</p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Concept</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLedger.map((entry) => {
                  const isCharge = entry.amount_cents > 0
                  const runningBalance = balanceAfter.get(entry.id) ?? 0
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(entry.created_at)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {getFullName(entry.student.user)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={LEDGER_TYPE_BADGE[entry.entry_type]}>
                          {LEDGER_TYPE_LABEL[entry.entry_type]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[16rem] truncate">
                        {entry.description || '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {entry.payment_method ? methodLabel(entry.payment_method) : '—'}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right font-medium tabular-nums',
                          isCharge ? 'text-amber-600' : 'text-emerald-600'
                        )}
                      >
                        {isCharge ? '+' : '−'}
                        {formatCurrency(Math.abs(entry.amount_cents))}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatCurrency(runningBalance)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
