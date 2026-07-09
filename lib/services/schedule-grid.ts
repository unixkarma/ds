// Graphical scheduler data service (backend-first; no new tables).
// Aggregates openings, booked lessons, and approved days-off for a single date
// into one row per instructor, shaped for a grid UI. Reuses the existing
// openings/lessons/days-off tables via the RLS-scoped server client.

import { createClient } from '@/lib/supabase/server'
import type { ScheduleGridData, ScheduleGridRow, ScheduleGridSlot, ScheduleGridView } from '@/types'

export interface GridQuery {
  date: string // YYYY-MM-DD (school timezone; app runs TZ=America/Chicago)
  view: ScheduleGridView
  instructorId?: string
}

// Day boundaries. The app process runs with TZ=America/Chicago, so a local
// Date built from the date string yields the correct school-day window.
function dayRange(date: string): { start: string; end: string } {
  const start = new Date(`${date}T00:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

export async function getGridData(q: GridQuery): Promise<ScheduleGridData> {
  const supabase = await createClient()
  const { start, end } = dayRange(q.date)

  // Instructors (rows). Narrow to one when the view is single-instructor.
  let instructorsQuery = supabase
    .from('instructors')
    .select('id, is_active, user:users!user_id(first_name, last_name)')
    .eq('is_active', true)
  if (q.view === 'single-instructor' && q.instructorId) {
    instructorsQuery = instructorsQuery.eq('id', q.instructorId)
  }
  const { data: instructors, error: instErr } = await instructorsQuery
  if (instErr) throw new Error(instErr.message)

  const rows: ScheduleGridRow[] = []

  for (const inst of (instructors ?? []) as unknown as Array<{
    id: string
    user: { first_name: string; last_name: string } | null
  }>) {
    const slots: ScheduleGridSlot[] = []

    const { data: openings } = await supabase
      .from('openings')
      .select('id, scheduled_at, duration_minutes, status')
      .eq('instructor_id', inst.id)
      .gte('scheduled_at', start)
      .lt('scheduled_at', end)

    for (const o of (openings ?? []) as unknown as Array<{
      id: string
      scheduled_at: string
      duration_minutes: number
      status: string
    }>) {
      slots.push({
        id: o.id,
        start: o.scheduled_at,
        duration_minutes: o.duration_minutes,
        kind: 'opening',
        status: o.status,
      })
    }

    const { data: lessons } = await supabase
      .from('lessons')
      .select('id, scheduled_at, duration_minutes, status, pickup_location, student:students(user:users!user_id(first_name, last_name))')
      .eq('instructor_id', inst.id)
      .gte('scheduled_at', start)
      .lt('scheduled_at', end)

    for (const l of (lessons ?? []) as unknown as Array<{
      id: string
      scheduled_at: string
      duration_minutes: number
      status: string
      pickup_location: string
      student: { user: { first_name: string; last_name: string } | null } | null
    }>) {
      const su = l.student?.user
      slots.push({
        id: l.id,
        start: l.scheduled_at,
        duration_minutes: l.duration_minutes,
        kind: 'lesson',
        status: l.status,
        student_name: su ? `${su.first_name} ${su.last_name}`.trim() : undefined,
        location: l.pickup_location || undefined,
      })
    }

    const { data: daysOff } = await supabase
      .from('instructor_days_off')
      .select('id, date, status')
      .eq('instructor_id', inst.id)
      .eq('date', q.date)
      .eq('status', 'approved')

    for (const d of (daysOff ?? []) as unknown as Array<{ id: string; date: string }>) {
      slots.push({
        id: d.id,
        start: `${q.date}T00:00:00`,
        duration_minutes: 24 * 60,
        kind: 'day-off',
        status: 'off',
      })
    }

    slots.sort((a, b) => a.start.localeCompare(b.start))
    rows.push({
      instructor_id: inst.id,
      instructor_name: inst.user ? `${inst.user.first_name} ${inst.user.last_name}`.trim() : '',
      slots,
    })
  }

  return { date: q.date, view: q.view, rows }
}
