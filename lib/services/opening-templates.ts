// Opening templates service — fetch templates available to the current instructor.
// Returns school-level defaults (instructor_id IS NULL) + the instructor's own templates,
// plus the openings the instructor has scheduled for the next 14 days (for the planner UI).

import { createClient } from '@/lib/supabase/server'
import type { Opening, OpeningTemplate } from '@/types'

export interface OpeningsPlannerData {
  instructorId: string
  schoolDefaults: OpeningTemplate[]   // instructor_id IS NULL — read-only for instructors
  ownTemplates: OpeningTemplate[]     // instructor_id = self — full CRUD
  upcomingOpenings: Opening[]         // next 14 days (today + 13), all statuses, sorted by scheduled_at
}

export async function getOpeningsPlannerData(): Promise<OpeningsPlannerData | null> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: instructor } = await supabase
    .from('instructors')
    .select('id, user:users(school_id)')
    .eq('user_id', user.id)
    .single()

  if (!instructor) return null

  const schoolId = (instructor as unknown as { user: { school_id: string } }).user.school_id
  const instructorId = instructor.id

  // 14-day range: today 00:00 → today + 14 days 00:00 (exclusive)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const horizon = new Date(today)
  horizon.setDate(horizon.getDate() + 14)

  const [templatesRes, openingsRes] = await Promise.all([
    supabase
      .from('opening_templates')
      .select('*')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: true }),
    supabase
      .from('openings')
      .select('*')
      .eq('instructor_id', instructorId)
      .gte('scheduled_at', today.toISOString())
      .lt('scheduled_at', horizon.toISOString())
      .order('scheduled_at', { ascending: true }),
  ])

  if (templatesRes.error) throw new Error(templatesRes.error.message)
  if (openingsRes.error) throw new Error(openingsRes.error.message)

  const all = (templatesRes.data ?? []) as OpeningTemplate[]
  return {
    instructorId,
    schoolDefaults: all.filter(t => t.instructor_id === null),
    ownTemplates: all.filter(t => t.instructor_id === instructorId),
    upcomingOpenings: (openingsRes.data ?? []) as Opening[],
  }
}

// Backwards-compat alias — older callers import the previous name.
export const getOpeningTemplatesForInstructor = getOpeningsPlannerData
