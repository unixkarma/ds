'use client'

import { useState } from 'react'
import { Package, Clock } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {packages.map(pkg => (
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
          <CardContent className="flex-1">
            <p className="text-3xl font-bold">
              ${(pkg.price_cents / 100).toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              ${(pkg.price_cents / pkg.lesson_count / 100).toFixed(2)} per lesson
            </p>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full"
              disabled={loading === pkg.id}
              onClick={() => handleBuy(pkg.id)}
            >
              <Package className="mr-2 h-4 w-4" />
              {loading === pkg.id ? 'Redirecting…' : 'Buy Package'}
            </Button>
          </CardFooter>
        </Card>
      ))}

      {hasSingleLesson && (
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
          <CardContent className="flex-1">
            <p className="text-3xl font-bold">
              ${(singleLessonPriceCents / 100).toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">per lesson</p>
          </CardContent>
          <CardFooter>
            <Button
              variant="outline"
              className="w-full"
              disabled={loading === 'single_lesson'}
              onClick={() => handleBuy('single_lesson')}
            >
              <Clock className="mr-2 h-4 w-4" />
              {loading === 'single_lesson' ? 'Redirecting…' : 'Buy Single Lesson'}
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  )
}
