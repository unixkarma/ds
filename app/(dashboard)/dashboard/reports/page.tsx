import type { Metadata } from 'next'

import { getReportsData } from '@/lib/services/reports'
import { ReportsClient } from '@/components/reports/reports-client'

export const metadata: Metadata = { title: 'Reports' }

export default async function ReportsPage() {
  const data = await getReportsData()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Analytics and insights for your driving school
        </p>
      </div>
      <ReportsClient data={data} />
    </div>
  )
}
