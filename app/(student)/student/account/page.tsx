import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { BookOpen, CheckCircle, Clock, ExternalLink, Receipt } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { getStudentPortalData } from '@/lib/services/student-portal'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { Payment, Package } from '@/types'

type PaymentRow = Payment & { package: Pick<Package, 'name' | 'lesson_count'> | null }

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  card: 'Card',
  cash: 'Cash',
  check: 'Check',
  other: 'Other',
}

export default async function StudentAccountPage() {
  const data = await getStudentPortalData()
  if (!data) redirect('/login')

  const { student } = data
  const lessonsRemaining = student.lessons_remaining ?? 0

  const supabase = await createClient()
  const { data: paymentsData } = await supabase
    .from('payments')
    .select(`
      id, school_id, student_id, package_id, stripe_payment_intent_id,
      amount_cents, status, payment_method, card_brand, card_last4,
      receipt_url, created_at,
      package:packages ( name, lesson_count )
    `)
    .eq('student_id', student.id)
    .order('created_at', { ascending: false })

  const payments = (paymentsData ?? []) as unknown as PaymentRow[]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Account</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Your lesson balance and payment history.
        </p>
      </div>

      {/* Balance */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={BookOpen}
          label="Lessons Purchased"
          value={student.total_lessons_purchased}
          iconClass="text-blue-500"
        />
        <StatCard
          icon={CheckCircle}
          label="Lessons Completed"
          value={student.total_lessons_completed}
          iconClass="text-emerald-500"
        />
        <StatCard
          icon={Clock}
          label="Lessons Remaining"
          value={Math.max(lessonsRemaining, 0)}
          iconClass="text-amber-500"
        />
      </div>

      {/* Payment history */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-4 w-4" />
            Payment History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <div className="py-10 text-center space-y-3">
              <p className="text-sm text-muted-foreground">No payments yet.</p>
              <Link href="/student/packages">
                <Button size="sm">Buy your first package</Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left font-medium text-muted-foreground pb-3 pr-4">
                      Date
                    </th>
                    <th className="text-left font-medium text-muted-foreground pb-3 pr-4">
                      Package
                    </th>
                    <th className="text-right font-medium text-muted-foreground pb-3 pr-4">
                      Lessons
                    </th>
                    <th className="text-right font-medium text-muted-foreground pb-3 pr-4">
                      Amount
                    </th>
                    <th className="text-left font-medium text-muted-foreground pb-3 pr-4">
                      Method
                    </th>
                    <th className="text-left font-medium text-muted-foreground pb-3">
                      Receipt
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {format(new Date(p.created_at), 'MMM d, yyyy')}
                      </td>
                      <td className="py-3 pr-4">
                        {p.package?.name ?? <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        {p.package?.lesson_count ?? '—'}
                      </td>
                      <td className="py-3 pr-4 text-right font-medium">
                        {formatCurrency(p.amount_cents)}
                      </td>
                      <td className="py-3 pr-4">
                        <PaymentMethodCell payment={p} />
                      </td>
                      <td className="py-3">
                        {p.receipt_url ? (
                          <a
                            href={p.receipt_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            View
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function PaymentMethodCell({ payment }: { payment: PaymentRow }) {
  const method = payment.payment_method ?? 'other'
  const label = PAYMENT_METHOD_LABEL[method] ?? method

  if (payment.card_brand && payment.card_last4) {
    const brand = payment.card_brand.charAt(0).toUpperCase() + payment.card_brand.slice(1)
    return (
      <span>
        {brand} •••• {payment.card_last4}
      </span>
    )
  }

  return <span>{label}</span>
}

function StatCard({
  icon: Icon,
  label,
  value,
  iconClass,
}: {
  icon: React.ElementType
  label: string
  value: number
  iconClass: string
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center gap-3">
          <Icon className={`h-5 w-5 ${iconClass} shrink-0`} />
          <div>
            <p className="text-2xl font-bold leading-none">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
