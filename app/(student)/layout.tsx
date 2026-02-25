// Student portal layout — simple top-nav, no sidebar.
// Redirects non-students (admins/instructors) to the dashboard.

import { redirect } from 'next/navigation'
import { type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { StudentHeader } from '@/components/student/student-header'

export default async function StudentLayout({ children }: { children: ReactNode }) {
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

  // Admins/instructors should use the dashboard, not the student portal
  if (!profile || profile.role === 'admin' || profile.role === 'instructor') {
    redirect('/dashboard')
  }

  const { data: school } = await supabase
    .from('schools')
    .select('name')
    .eq('id', profile.school_id)
    .single()

  const schoolName = (school as unknown as { name: string } | null)?.name ?? 'HelixDriving'

  return (
    <div className="min-h-screen bg-muted/30">
      <StudentHeader
        user={{
          firstName: profile.first_name,
          lastName: profile.last_name,
          email: profile.email,
        }}
        schoolName={schoolName}
      />
      <main className="max-w-4xl mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  )
}
