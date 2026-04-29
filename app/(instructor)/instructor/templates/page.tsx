import { redirect } from 'next/navigation'

import { getOpeningsPlannerData } from '@/lib/services/opening-templates'
import { TemplatesClient } from '@/components/openings/templates-client'

export default async function InstructorTemplatesPage() {
  const data = await getOpeningsPlannerData()
  if (!data) redirect('/login')

  return (
    <TemplatesClient
      instructorId={data.instructorId}
      schoolDefaults={data.schoolDefaults}
      ownTemplates={data.ownTemplates}
      upcomingOpenings={data.upcomingOpenings}
    />
  )
}
