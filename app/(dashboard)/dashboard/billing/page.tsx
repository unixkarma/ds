import type { Metadata } from 'next'
import { CheckCircle2, AlertTriangle } from 'lucide-react'

import { getSchoolSubscription, subscriptionHasAccess } from '@/lib/services/billing'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SubscribeButton } from '@/components/billing/subscribe-button'

export const metadata: Metadata = { title: 'Billing' }

const STATUS_LABEL: Record<string, string> = {
  none: 'No subscription',
  on_trial: 'On trial',
  active: 'Active',
  past_due: 'Past due',
  unpaid: 'Unpaid',
  paused: 'Paused',
  cancelled: 'Cancelled',
  expired: 'Expired',
}

export default async function BillingPage() {
  const sub = await getSchoolSubscription()
  const hasAccess = subscriptionHasAccess(sub)
  const status = sub?.status ?? 'none'

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Manage your HelixDriving subscription.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>Subscription</span>
            <Badge variant={hasAccess ? 'secondary' : 'destructive'}>
              {STATUS_LABEL[status] ?? status}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasAccess ? (
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" />
              <div>
                <p>Your subscription is active.</p>
                {sub?.current_period_end && (
                  <p className="text-muted-foreground">
                    Renews / ends on{' '}
                    {new Date(sub.current_period_end).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
              <p>
                You don&apos;t have an active subscription. Subscribe to keep using
                HelixDriving.
              </p>
            </div>
          )}

          <div className="flex gap-2">
            {!hasAccess && <SubscribeButton label="Subscribe" />}
            {sub?.ls_customer_portal_url && (
              <Button variant="outline" asChild>
                <a href={sub.ls_customer_portal_url} target="_blank" rel="noopener noreferrer">
                  Manage subscription
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
