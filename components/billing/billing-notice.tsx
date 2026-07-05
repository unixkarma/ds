import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { SubscribeButton } from '@/components/billing/subscribe-button'

// Shown when a school has no active subscription. `banner` is a soft nudge above
// the page (enforcement off); `gate` blocks the dashboard entirely (enforcement on).
export function BillingNotice({ mode }: { mode: 'banner' | 'gate' }) {
  if (mode === 'banner') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <span className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Your subscription isn&apos;t active.
        </span>
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard/billing">Go to billing</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <AlertTriangle className="h-8 w-8 text-amber-600" />
      <h1 className="text-xl font-semibold">Subscription required</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Your school doesn&apos;t have an active HelixDriving subscription.
        Subscribe to continue.
      </p>
      <div className="flex gap-2">
        <SubscribeButton label="Subscribe" />
        <Button variant="outline" asChild>
          <Link href="/dashboard/billing">Billing details</Link>
        </Button>
      </div>
    </div>
  )
}
