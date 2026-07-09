// Shared auth context for API routes. Returns the caller's id/role/school, or
// null when unauthenticated / profile missing. Routes turn null (or a wrong
// role) into the appropriate 401/403 themselves so error codes stay explicit.

import { createClient } from '@/lib/supabase/server'

export interface AuthContext {
  userId: string
  role: string
  schoolId: string
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('users')
    .select('role, school_id')
    .eq('id', user.id)
    .single<{ role: string; school_id: string }>()

  if (!profile) return null
  return { userId: user.id, role: profile.role, schoolId: profile.school_id }
}
