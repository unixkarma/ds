// Schedule service — server-side data fetching for the calendar.

import { createClient } from '@/lib/supabase/server'
import type {
  LessonWithRelations,
  StudentWithUser,
  InstructorWithUser,
  Vehicle,
  Opening,
} from '@/types'

// Fetch all lessons between two dates (inclusive) with full relations
export async function getLessonsForRange(
  startDate: Date,
  endDate: Date
): Promise<LessonWithRelations[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('lessons')
    .select(`
      *,
      student:students(*, user:users!user_id(*)),
      instructor:instructors(*, user:users(*)),
      vehicle:vehicles(*)
    `)
    .gte('scheduled_at', startDate.toISOString())
    .lt('scheduled_at', endDate.toISOString())
    .order('scheduled_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as LessonWithRelations[]
}

// Fetch openings (available + blocked) in the given range — used to overlay
// the calendar so admin can SEE what slots instructors have published / locked.
export async function getOpeningsForRange(
  startDate: Date,
  endDate: Date
): Promise<Opening[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('openings')
    .select('id, school_id, instructor_id, template_id, scheduled_at, duration_minutes, status, created_at')
    .in('status', ['available', 'blocked'])
    .gte('scheduled_at', startDate.toISOString())
    .lt('scheduled_at', endDate.toISOString())
    .order('scheduled_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as Opening[]
}

// Fetch all active students, active instructors, and active vehicles
// needed to populate the booking form dropdowns.
export async function getBookingFormData(): Promise<{
  students: StudentWithUser[]
  instructors: InstructorWithUser[]
  vehicles: Vehicle[]
}> {
  const supabase = await createClient()

  const [studentsRes, instructorsRes, vehiclesRes] = await Promise.all([
    supabase
      .from('students')
      .select('*, user:users!user_id(*)')
      .eq('status', 'active')
      .order('created_at', { ascending: false }),

    supabase
      .from('instructors')
      .select('*, user:users(*), availability(*)')
      .eq('is_active', true),

    supabase
      .from('vehicles')
      .select('*')
      .eq('is_active', true)
      .order('make', { ascending: true }),
  ])

  return {
    students: (studentsRes.data ?? []) as unknown as StudentWithUser[],
    instructors: (instructorsRes.data ?? []) as unknown as InstructorWithUser[],
    vehicles: (vehiclesRes.data ?? []) as Vehicle[],
  }
}

// Helper: get the Monday of a given date's week
export function getWeekStart(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

// Helper: get the Sunday (end of week) — exclusive end for range queries
export function getWeekEnd(weekStart: Date): Date {
  const d = new Date(weekStart)
  d.setDate(d.getDate() + 7)
  return d
}
