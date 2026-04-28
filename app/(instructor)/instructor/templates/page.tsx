import { redirect } from 'next/navigation'

import { getOpeningTemplatesForInstructor } from '@/lib/services/opening-templates'
import { TemplatesClient } from '@/components/openings/templates-client'

export default async function InstructorTemplatesPage() {
  const data = await getOpeningTemplatesForInstructor()
  if (!data) redirect('/login')

  return (
    <TemplatesClient
      schoolDefaults={data.schoolDefaults}
      ownTemplates={data.ownTemplates}
    />
  )
}
