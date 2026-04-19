// Instructor portal layout — top-nav, no sidebar.
// Redirects non-instructors to the appropriate portal.

import { redirect } from 'next/navigation'
import { type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { InstructorHeader } from '@/components/instructor/instructor-header'

export default async function InstructorLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role, first_name, last_name, email, school_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'instructor') {
    if (profile?.role === 'student') {
      redirect('/student')
    }
    redirect('/dashboard')
  }

  const { data: school } = await supabase
    .from('schools_public')
    .select('name')
    .eq('id', profile.school_id)
    .single()

  const schoolName = (school as unknown as { name: string } | null)?.name ?? 'HelixDriving'

  return (
    <div className="min-h-screen bg-muted/30">
      <InstructorHeader
        user={{
          firstName: profile.first_name,
          lastName: profile.last_name,
          email: profile.email,
        }}
        schoolName={schoolName}
      />
      <main className="max-w-5xl mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  )
}
