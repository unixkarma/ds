import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { BookLessonFlow } from '@/components/student/book-lesson-flow'
import type { InstructorWithUserAndAvailability } from '@/types'

export default async function StudentBookPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get the student record
  const { data: student } = await supabase
    .from('students')
    .select('id, lessons_remaining, school_id')
    .eq('user_id', user.id)
    .single()

  if (!student) redirect('/student')

  // Get active instructors with their availability (same school)
  const { data: instructors } = await supabase
    .from('instructors')
    .select('*, user:users(*), availability(*)')
    .eq('school_id', student.school_id)
    .eq('is_active', true)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Book a Lesson</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Choose an instructor and pick an available time slot.
        </p>
      </div>

      <BookLessonFlow
        studentId={student.id}
        lessonsRemaining={student.lessons_remaining}
        instructors={(instructors ?? []) as unknown as InstructorWithUserAndAvailability[]}
      />
    </div>
  )
}
