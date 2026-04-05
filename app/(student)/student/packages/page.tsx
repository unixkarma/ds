import { redirect } from 'next/navigation'
import { CheckCircle, XCircle } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PackageCheckout } from '@/components/student/package-checkout'
import type { Package, School } from '@/types'

interface PageProps {
  searchParams: Promise<{ success?: string; cancelled?: string }>
}

export default async function StudentPackagesPage({ searchParams }: PageProps) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('school_id')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  const adminClient = createAdminClient()

  // Fetch packages + school config in parallel
  const [{ data: packagesData }, { data: schoolData }] = await Promise.all([
    adminClient
      .from('packages')
      .select('*')
      .eq('school_id', profile.school_id)
      .eq('is_active', true)
      .order('price_cents', { ascending: true }),
    adminClient
      .from('schools')
      .select('stripe_publishable_key, single_lesson_price_cents')
      .eq('id', profile.school_id)
      .single(),
  ])

  const packages = (packagesData ?? []) as Package[]
  const school = schoolData as Pick<School, 'stripe_publishable_key' | 'single_lesson_price_cents'> | null
  const stripeEnabled = !!school?.stripe_publishable_key

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Buy Lessons</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Purchase a lesson package or a single lesson
        </p>
      </div>

      {params.success && (
        <Alert className="border-emerald-500 bg-emerald-50 text-emerald-800">
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            Payment successful! Your lessons have been credited to your account.
          </AlertDescription>
        </Alert>
      )}

      {params.cancelled && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>Payment was cancelled. No charge was made.</AlertDescription>
        </Alert>
      )}

      {!stripeEnabled ? (
        <div className="text-center py-16 text-muted-foreground text-sm border rounded-lg">
          Online payments are not yet available. Please contact your school to purchase lessons.
        </div>
      ) : (
        <PackageCheckout
          packages={packages}
          singleLessonPriceCents={school?.single_lesson_price_cents ?? 0}
        />
      )}
    </div>
  )
}
