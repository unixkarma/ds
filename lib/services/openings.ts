// Openings service — server-side data fetching for opening templates and openings.
// Openings are pre-bookable slots an instructor publishes; students claim them
// instead of picking arbitrary times.

import { createClient } from '@/lib/supabase/server'
import type {
  Opening,
  OpeningTemplate,
  OpeningWithInstructor,
} from '@/types'

// Fetch openings between two dates (inclusive of start, exclusive of end).
// Optional filters narrow by school / instructor / status.
export async function getOpeningsForRange(
  startDate: Date,
  endDate: Date,
  filters: { schoolId?: string; instructorId?: string; statuses?: Opening['status'][] } = {}
): Promise<OpeningWithInstructor[]> {
  const supabase = await createClient()

  let query = supabase
    .from('openings')
    .select(`
      *,
      instructor:instructors(*, user:users(*))
    `)
    .gte('scheduled_at', startDate.toISOString())
    .lt('scheduled_at', endDate.toISOString())
    .order('scheduled_at', { ascending: true })

  if (filters.schoolId) query = query.eq('school_id', filters.schoolId)
  if (filters.instructorId) query = query.eq('instructor_id', filters.instructorId)
  if (filters.statuses && filters.statuses.length > 0) {
    query = query.in('status', filters.statuses)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as OpeningWithInstructor[]
}

// Fetch templates visible to the given instructor: their own + school-level defaults.
// `instructorId` is the instructors.id (NOT users.id).
export async function getTemplatesForInstructor(
  schoolId: string,
  instructorId: string
): Promise<OpeningTemplate[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('opening_templates')
    .select('*')
    .eq('school_id', schoolId)
    .or(`instructor_id.is.null,instructor_id.eq.${instructorId}`)
    .order('instructor_id', { ascending: true, nullsFirst: true }) // school defaults first
    .order('name', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as OpeningTemplate[]
}

// Fetch all templates for a school (admin view).
export async function getAllTemplatesForSchool(schoolId: string): Promise<OpeningTemplate[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('opening_templates')
    .select('*')
    .eq('school_id', schoolId)
    .order('instructor_id', { ascending: true, nullsFirst: true })
    .order('name', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as OpeningTemplate[]
}
