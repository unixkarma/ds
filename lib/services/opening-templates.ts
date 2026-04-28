// Opening templates service — fetch templates available to the current instructor.
// Returns school-level defaults (instructor_id IS NULL) + the instructor's own templates.

import { createClient } from '@/lib/supabase/server'
import type { OpeningTemplate } from '@/types'

export interface OpeningTemplatesData {
  instructorId: string
  schoolDefaults: OpeningTemplate[]   // instructor_id IS NULL — read-only for instructors
  ownTemplates: OpeningTemplate[]     // instructor_id = self — full CRUD
}

export async function getOpeningTemplatesForInstructor(): Promise<OpeningTemplatesData | null> {
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

  const { data: templates, error } = await supabase
    .from('opening_templates')
    .select('*')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)

  const all = (templates ?? []) as OpeningTemplate[]
  return {
    instructorId: instructor.id,
    schoolDefaults: all.filter(t => t.instructor_id === null),
    ownTemplates: all.filter(t => t.instructor_id === instructor.id),
  }
}
