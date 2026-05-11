import type { Metadata } from 'next'
import { format } from 'date-fns'
import { DollarSign } from 'lucide-react'

import { getPayments } from '@/lib/services/payments'
import { getFullName } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { PaymentStatus } from '@/types'

export const metadata: Metadata = { title: 'Payments' }

const STATUS_BADGE: Record<PaymentStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline',
  completed: 'default',
  refunded: 'secondary',
  failed: 'destructive',
}

export default async function PaymentsPage() {
  const payments = await getPayments()

  const totalCents = payments
    .filter(p => p.status === 'completed')
    .reduce((sum, p) => sum + p.amount_cents, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Payments</h1>
        <p className="text-sm text-muted-foreground mt-1">
          All payments from your students
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Revenue
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${(totalCents / 100).toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-1">From completed payments</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Payments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{payments.length}</p>
            <p className="text-xs text-muted-foreground mt-1">All time</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {payments.filter(p => p.status === 'completed').length}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Successfully processed</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      {payments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border rounded-lg">
          <DollarSign className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground text-sm">No payments yet.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Package</TableHead>
                <TableHead>Concept</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead>Sale</TableHead>
                <TableHead>Paid</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map(payment => {
                const saleStr = format(new Date(payment.sale_date), 'MMM d, yyyy')
                const paidStr = format(new Date(payment.created_at), 'MMM d, yyyy')
                const sameDay = saleStr === paidStr
                return (
                  <TableRow key={payment.id}>
                    <TableCell className="font-medium">
                      {getFullName(payment.student.user)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {payment.package?.name ?? 'Single Lesson'}
                    </TableCell>
                    <TableCell
                      className="text-muted-foreground text-sm max-w-[220px] truncate"
                      title={payment.description ?? ''}
                    >
                      {payment.description || '—'}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      ${(payment.amount_cents / 100).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={STATUS_BADGE[payment.status]}>
                        {payment.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {saleStr}
                    </TableCell>
                    <TableCell
                      className={
                        sameDay
                          ? 'text-muted-foreground text-sm whitespace-nowrap'
                          : 'text-sm whitespace-nowrap font-medium text-amber-600'
                      }
                      title={sameDay ? 'Sold and paid same day' : 'Paid after sale'}
                    >
                      {paidStr}
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
