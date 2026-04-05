// Settings service — fetch the current school's configuration.
// Used by the admin Settings page.

import { createClient } from '@/lib/supabase/server'
import type { School } from '@/types'

export async function getSchoolSettings(): Promise<School> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('users')
    .select('school_id')
    .eq('id', user.id)
    .single()

  if (!profile) throw new Error('Profile not found')

  const { data, error } = await supabase
    .from('schools')
    .select('*')
    .eq('id', profile.school_id)
    .single()

  if (error) throw new Error(error.message)
  return data as School
}
