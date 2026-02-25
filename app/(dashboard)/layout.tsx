import { redirect } from 'next/navigation'
import { type ReactNode } from 'react'

import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'

// Protect all /dashboard/* routes — server-side auth check
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch the user's profile and their school name in one query
  const { data: profile } = await supabase
    .from('users')
    .select('first_name, last_name, school:schools(name)')
    .eq('id', user.id)
    .single()

  // Supabase infers the joined relation as an array; cast via unknown
  const schoolName =
    (profile?.school as unknown as { name: string } | null)?.name ?? 'My School'

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar — hidden on mobile */}
      <aside className="hidden md:flex md:flex-col md:w-60 border-r flex-shrink-0">
        <Sidebar schoolName={schoolName} />
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          user={{
            firstName: profile?.first_name ?? '',
            lastName: profile?.last_name ?? '',
            email: user.email ?? '',
          }}
          schoolName={schoolName}
        />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
