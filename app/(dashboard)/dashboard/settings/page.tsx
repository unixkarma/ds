import type { Metadata } from 'next'
import { getSchoolSettings } from '@/lib/services/settings'
import { SettingsForm } from '@/components/settings/settings-form'

export const metadata: Metadata = { title: 'Settings' }

export default async function SettingsPage() {
  const school = await getSchoolSettings()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your school information and Stripe integration
        </p>
      </div>

      <SettingsForm school={school} />
    </div>
  )
}
