import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { BookLessonFlow } from '@/components/student/book-lesson-flow'
import type { InstructorWithUser, Opening } from '@/types'

export default async function StudentBookPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: student } = await supabase
    .from('students')
    .select('id, lessons_remaining, school_id, user:users!user_id(address, city, state, zip_code)')
    .eq('user_id', user.id)
    .single()

  if (!student) redirect('/student')

  // Build a sensible default pickup/dropoff from the student's profile address.
  // Including the ZIP is what makes the travel-time heuristic actually work.
  const u = (student as unknown as { user: { address: string; city: string; state: string; zip_code: string } }).user
  const defaultLocation = u
    ? [u.address, u.city, u.state, u.zip_code].filter(Boolean).join(', ').trim()
    : ''

  // Active instructors in the same school. We don't pull `availability` anymore —
  // the bookable slots come from the `openings` table.
  const { data: instructors } = await supabase
    .from('instructors')
    .select('*, user:users(*)')
    .eq('school_id', student.school_id)
    .eq('is_active', true)

  // All openings the student is allowed to see (RLS narrows to status='available').
  // Window: from now to +14 days (matches the regenerator's horizon).
  const now = new Date()
  const horizon = new Date(now)
  horizon.setDate(now.getDate() + 14)

  const { data: openings } = await supabase
    .from('openings')
    .select('id, instructor_id, scheduled_at, duration_minutes, status, school_id, template_id, created_at')
    .eq('school_id', student.school_id)
    .eq('status', 'available')
    .gte('scheduled_at', now.toISOString())
    .lt('scheduled_at', horizon.toISOString())
    .order('scheduled_at', { ascending: true })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Book a Lesson</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Choose an instructor and pick from their available time slots.
        </p>
      </div>

      <BookLessonFlow
        studentId={student.id}
        lessonsRemaining={student.lessons_remaining}
        instructors={(instructors ?? []) as unknown as InstructorWithUser[]}
        openings={(openings ?? []) as unknown as Opening[]}
        defaultLocation={defaultLocation}
      />
    </div>
  )
}
