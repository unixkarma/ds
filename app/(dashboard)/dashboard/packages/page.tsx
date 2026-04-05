import type { Metadata } from 'next'
import { getPackages } from '@/lib/services/packages'
import { getSchoolSettings } from '@/lib/services/settings'
import { PackageTable } from '@/components/packages/package-table'

export const metadata: Metadata = { title: 'Packages' }

export default async function PackagesPage() {
  const [packages, school] = await Promise.all([
    getPackages(),
    getSchoolSettings(),
  ])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Packages</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage lesson packages and pricing for your students
        </p>
      </div>

      <PackageTable packages={packages} singleLessonPriceCents={school.single_lesson_price_cents} />
    </div>
  )
}
