// Admin service — fetch instructor applications for the current school.

import { createClient } from '@/lib/supabase/server'
import type { InstructorApplication } from '@/types'

export async function getInstructorApplications(): Promise<InstructorApplication[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: profile } = await supabase
    .from('users')
    .select('school_id')
    .eq('id', user.id)
    .single()

  if (!profile) return []

  const { data } = await supabase
    .from('instructor_applications')
    .select('*')
    .eq('school_id', profile.school_id)
    .order('created_at', { ascending: false })

  return (data ?? []) as InstructorApplication[]
}

export async function getPendingApplicationsCount(): Promise<number> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0

  const { data: profile } = await supabase
    .from('users')
    .select('school_id')
    .eq('id', user.id)
    .single()

  if (!profile) return 0

  const { count } = await supabase
    .from('instructor_applications')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', profile.school_id)
    .eq('status', 'pending')

  return count ?? 0
}
