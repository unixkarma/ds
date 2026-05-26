'use client'

import { useState } from 'react'
import { Package, Clock, AlertCircle, CreditCard } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { applyCardSurcharge, CARD_SURCHARGE_RATE } from '@/lib/surcharge'
import type { Package as PkgType } from '@/types'

interface PackageCheckoutProps {
  packages: PkgType[]
  singleLessonPriceCents: number
}

export function PackageCheckout({ packages, singleLessonPriceCents }: PackageCheckoutProps) {
  const [loading, setLoading] = useState<string | null>(null)

  async function handleBuy(packageId: string) {
    setLoading(packageId)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package_id: packageId }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      }
    } finally {
      setLoading(null)
    }
  }

  const hasSingleLesson = singleLessonPriceCents > 0
  const hasItems = packages.length > 0 || hasSingleLesson

  if (!hasItems) {
    return (
      <div className="text-center py-16 text-muted-foreground text-sm border rounded-lg">
        No packages available yet. Please contact your school.
      </div>
    )
  }

  const surchargePct = (CARD_SURCHARGE_RATE * 100).toFixed(0)

  return (
    <>
      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 flex items-start gap-2 mb-4">
        <CreditCard className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold mb-0.5">{surchargePct}% card processing fee</p>
          <p className="leading-relaxed">
            Card payments are processed through Stripe and include a {surchargePct}%
            processing fee on top of the package price. The full breakdown is shown
            on the secure Stripe checkout page before you confirm.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {packages.map(pkg => {
          const breakdown = applyCardSurcharge(pkg.price_cents)
          return (
            <Card key={pkg.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{pkg.name}</CardTitle>
                  <Badge variant="secondary" className="shrink-0">
                    {pkg.lesson_count} lessons
                  </Badge>
                </div>
                {pkg.description && (
                  <CardDescription>{pkg.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="flex-1 space-y-3">
                <div>
                  <p className="text-3xl font-bold">
                    ${(pkg.price_cents / 100).toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    ${(pkg.price_cents / pkg.lesson_count / 100).toFixed(2)} per lesson
                  </p>
                </div>
                <div className="rounded-md border bg-muted/30 p-2 text-[11px] text-muted-foreground space-y-0.5">
                  <div className="flex justify-between">
                    <span>+ {surchargePct}% card fee</span>
                    <span>${(breakdown.surchargeCents / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-foreground border-t pt-0.5 mt-0.5">
                    <span>Total with card</span>
                    <span>${(breakdown.totalCents / 100).toFixed(2)}</span>
                  </div>
                </div>
                {pkg.requirements && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-semibold mb-1">Important — Requirements</p>
                        <p className="whitespace-pre-wrap leading-relaxed">{pkg.requirements}</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  disabled={loading === pkg.id}
                  onClick={() => handleBuy(pkg.id)}
                >
                  <Package className="mr-2 h-4 w-4" />
                  {loading === pkg.id
                    ? 'Redirecting…'
                    : `Buy — $${(breakdown.totalCents / 100).toFixed(2)}`}
                </Button>
              </CardFooter>
            </Card>
          )
        })}

        {hasSingleLesson && (() => {
          const breakdown = applyCardSurcharge(singleLessonPriceCents)
          return (
            <Card className="flex flex-col border-dashed">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">Single Lesson</CardTitle>
                  <Badge variant="outline" className="shrink-0">
                    1 lesson
                  </Badge>
                </div>
                <CardDescription>Pay as you go</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 space-y-3">
                <div>
                  <p className="text-3xl font-bold">
                    ${(singleLessonPriceCents / 100).toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">per lesson</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-2 text-[11px] text-muted-foreground space-y-0.5">
                  <div className="flex justify-between">
                    <span>+ {surchargePct}% card fee</span>
                    <span>${(breakdown.surchargeCents / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-foreground border-t pt-0.5 mt-0.5">
                    <span>Total with card</span>
                    <span>${(breakdown.totalCents / 100).toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={loading === 'single_lesson'}
                  onClick={() => handleBuy('single_lesson')}
                >
                  <Clock className="mr-2 h-4 w-4" />
                  {loading === 'single_lesson'
                    ? 'Redirecting…'
                    : `Buy — $${(breakdown.totalCents / 100).toFixed(2)}`}
                </Button>
              </CardFooter>
            </Card>
          )
        })()}
      </div>
    </>
  )
}
