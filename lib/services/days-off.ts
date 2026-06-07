// Admin service — fetch instructor day-off requests for the current school.

import { createClient } from '@/lib/supabase/server'
import type { DayOffStatus } from '@/types'

export interface DayOffRequest {
  id: string
  instructor_id: string
  instructor_name: string
  date: string
  reason: string | null
  status: DayOffStatus
  created_at: string
}

export async function getDaysOffRequests(): Promise<DayOffRequest[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: profile } = await supabase
    .from('users')
    .select('school_id')
    .eq('id', user.id)
    .single()
  if (!profile) return []

  // Show upcoming requests (today onward) — past days off aren't actionable.
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data } = await supabase
    .from('instructor_days_off')
    .select('id, instructor_id, date, reason, status, created_at, instructor:instructors(user:users!user_id(first_name, last_name))')
    .eq('school_id', profile.school_id)
    .gte('date', today.toISOString().slice(0, 10))
    .order('date', { ascending: true })

  return (data ?? []).map((row) => {
    const u = (row.instructor as unknown as { user: { first_name: string; last_name: string } | null } | null)?.user
    const name = u ? `${u.first_name} ${u.last_name}`.trim() : 'Unknown'
    return {
      id: row.id,
      instructor_id: row.instructor_id,
      instructor_name: name || 'Unknown',
      date: row.date,
      reason: row.reason,
      status: row.status as DayOffStatus,
      created_at: row.created_at,
    }
  })
}

export async function getPendingDaysOffCount(): Promise<number> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0

  const { data: profile } = await supabase
    .from('users')
    .select('school_id')
    .eq('id', user.id)
    .single()
  if (!profile) return 0

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { count } = await supabase
    .from('instructor_days_off')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', profile.school_id)
    .eq('status', 'pending')
    .gte('date', today.toISOString().slice(0, 10))

  return count ?? 0
}
