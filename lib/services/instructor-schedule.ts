// Instructor schedule service — unified data for /instructor/schedule.
// Combines: templates, days off, upcoming openings, and the instructor's preferences.

import { createClient } from '@/lib/supabase/server'
import type {
  InstructorDayOff,
  Opening,
  OpeningTemplate,
} from '@/types'

export interface InstructorScheduleData {
  instructorId: string
  schoolId: string
  bufferMinutes: number
  schoolDefaults: OpeningTemplate[]
  ownTemplates: OpeningTemplate[]
  daysOff: InstructorDayOff[]
  upcomingOpenings: Opening[]
}

export async function getInstructorScheduleData(): Promise<InstructorScheduleData | null> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: instructor } = await supabase
    .from('instructors')
    .select('id, buffer_minutes, user:users(school_id)')
    .eq('user_id', user.id)
    .single()

  if (!instructor) return null

  const instructorId = instructor.id
  const bufferMinutes = (instructor.buffer_minutes as number | null) ?? 0
  const schoolId = (instructor as unknown as { user: { school_id: string } }).user.school_id

  // Today 00:00 → +60 days for days off, +14 for openings
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const daysOffHorizon = new Date(today)
  daysOffHorizon.setDate(today.getDate() + 60)
  const openingsHorizon = new Date(today)
  openingsHorizon.setDate(today.getDate() + 14)

  const [templatesRes, daysOffRes, openingsRes] = await Promise.all([
    supabase
      .from('opening_templates')
      .select('*')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: true }),
    supabase
      .from('instructor_days_off')
      .select('*')
      .eq('instructor_id', instructorId)
      .gte('date', today.toISOString().slice(0, 10))
      .lt('date', daysOffHorizon.toISOString().slice(0, 10))
      .order('date', { ascending: true }),
    supabase
      .from('openings')
      .select('*')
      .eq('instructor_id', instructorId)
      .gte('scheduled_at', today.toISOString())
      .lt('scheduled_at', openingsHorizon.toISOString())
      .order('scheduled_at', { ascending: true }),
  ])

  if (templatesRes.error) throw new Error(templatesRes.error.message)
  if (daysOffRes.error) throw new Error(daysOffRes.error.message)
  if (openingsRes.error) throw new Error(openingsRes.error.message)

  const allTemplates = (templatesRes.data ?? []) as OpeningTemplate[]

  return {
    instructorId,
    schoolId,
    bufferMinutes,
    schoolDefaults: allTemplates.filter(t => t.instructor_id === null),
    ownTemplates: allTemplates.filter(t => t.instructor_id === instructorId),
    daysOff: (daysOffRes.data ?? []) as InstructorDayOff[],
    upcomingOpenings: (openingsRes.data ?? []) as Opening[],
  }
}
