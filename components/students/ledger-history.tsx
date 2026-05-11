import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { cn, formatCurrency } from '@/lib/utils'
import type { StudentLedgerEntry } from '@/types'

const ENTRY_LABEL: Record<StudentLedgerEntry['entry_type'], string> = {
  charge: 'Charge',
  payment: 'Payment',
  adjustment: 'Adjustment',
}

const ENTRY_BADGE: Record<StudentLedgerEntry['entry_type'], 'destructive' | 'default' | 'secondary'> = {
  charge: 'destructive',
  payment: 'default',
  adjustment: 'secondary',
}

interface LedgerHistoryProps {
  entries: StudentLedgerEntry[]
}

export function LedgerHistory({ entries }: LedgerHistoryProps) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No balance activity yet.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left font-medium text-muted-foreground pb-3 pr-4">Date</th>
            <th className="text-left font-medium text-muted-foreground pb-3 pr-4">Type</th>
            <th className="text-left font-medium text-muted-foreground pb-3 pr-4">Description</th>
            <th className="text-right font-medium text-muted-foreground pb-3">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {entries.map((entry) => {
            const isPositive = entry.amount_cents > 0
            return (
              <tr key={entry.id}>
                <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">
                  {format(new Date(entry.created_at), 'MMM d, yyyy')}
                </td>
                <td className="py-3 pr-4">
                  <Badge variant={ENTRY_BADGE[entry.entry_type]}>
                    {ENTRY_LABEL[entry.entry_type]}
                  </Badge>
                </td>
                <td className="py-3 pr-4 text-muted-foreground">
                  {entry.description || '—'}
                  {entry.payment_method && (
                    <span className="ml-1 text-xs">({entry.payment_method})</span>
                  )}
                </td>
                <td
                  className={cn(
                    'py-3 text-right font-medium tabular-nums',
                    isPositive ? 'text-destructive' : 'text-primary'
                  )}
                >
                  {isPositive ? '+' : '−'}
                  {formatCurrency(Math.abs(entry.amount_cents))}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
