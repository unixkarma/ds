import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { cn, formatCurrency } from '@/lib/utils'
import type { StudentPurchase } from '@/types'

interface PurchasesHistoryProps {
  purchases: StudentPurchase[]
}

export function PurchasesHistory({ purchases }: PurchasesHistoryProps) {
  if (purchases.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No purchases recorded yet.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left font-medium text-muted-foreground pb-3 pr-4">Date</th>
            <th className="text-left font-medium text-muted-foreground pb-3 pr-4">Package</th>
            <th className="text-center font-medium text-muted-foreground pb-3 pr-4">
              Lessons activated
            </th>
            <th className="text-right font-medium text-muted-foreground pb-3 pr-4">Paid</th>
            <th className="text-right font-medium text-muted-foreground pb-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {purchases.map((p) => {
            const owed = p.price_cents - p.amount_paid_cents
            const fullyPaid = owed === 0
            const unpaid = p.amount_paid_cents === 0
            const status = fullyPaid ? 'Paid' : unpaid ? 'Unpaid' : 'Partial'
            const variant: 'default' | 'destructive' | 'secondary' = fullyPaid
              ? 'default'
              : unpaid
              ? 'destructive'
              : 'secondary'

            return (
              <tr key={p.id}>
                <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">
                  {format(new Date(p.created_at), 'MMM d, yyyy')}
                </td>
                <td className="py-3 pr-4 font-medium">{p.package_name}</td>
                <td className="py-3 pr-4 text-center tabular-nums">
                  <span
                    className={cn(
                      'font-medium',
                      p.lessons_activated < p.total_lessons && 'text-amber-600'
                    )}
                  >
                    {p.lessons_activated}/{p.total_lessons}
                  </span>
                </td>
                <td className="py-3 pr-4 text-right tabular-nums">
                  <span className="font-medium">
                    {formatCurrency(p.amount_paid_cents)}
                  </span>
                  <span className="text-muted-foreground">
                    {' / '}
                    {formatCurrency(p.price_cents)}
                  </span>
                </td>
                <td className="py-3 text-right">
                  <Badge variant={variant}>{status}</Badge>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
