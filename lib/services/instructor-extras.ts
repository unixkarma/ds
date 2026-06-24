// Instructor payroll extras — server-side data fetching for
// assignments, deductions, and reimbursements. All queries are scoped
// to the current user's school via RLS.

import { createClient } from '@/lib/supabase/server'
import type {
  InstructorAssignment,
  InstructorAssignmentWithInstructor,
  InstructorDeduction,
  InstructorDeductionWithInstructor,
  InstructorReimbursement,
  InstructorReimbursementWithInstructor,
} from '@/types'

// ── Per-instructor (admin detail page) ───────────────────────

export async function listAssignmentsForInstructor(
  instructorId: string
): Promise<InstructorAssignment[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('instructor_assignments')
    .select('*')
    .eq('instructor_id', instructorId)
    .order('scheduled_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as InstructorAssignment[]
}

export async function listDeductionsForInstructor(
  instructorId: string
): Promise<InstructorDeduction[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('instructor_deductions')
    .select('*')
    .eq('instructor_id', instructorId)
    .order('date', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as InstructorDeduction[]
}

export async function listReimbursementsForInstructor(
  instructorId: string
): Promise<InstructorReimbursement[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('instructor_reimbursements')
    .select('*')
    .eq('instructor_id', instructorId)
    .order('date', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as InstructorReimbursement[]
}

// ── School-wide (reports / payroll) ──────────────────────────

export async function listAssignmentsForSchool(): Promise<
  InstructorAssignmentWithInstructor[]
> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('instructor_assignments')
    .select('*, instructor:instructors(*, user:users(*))')
    .order('scheduled_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as InstructorAssignmentWithInstructor[]
}

export async function listDeductionsForSchool(): Promise<
  InstructorDeductionWithInstructor[]
> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('instructor_deductions')
    .select('*, instructor:instructors(*, user:users(*))')
    .order('date', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as InstructorDeductionWithInstructor[]
}

export async function listReimbursementsForSchool(): Promise<
  InstructorReimbursementWithInstructor[]
> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('instructor_reimbursements')
    .select('*, instructor:instructors(*, user:users(*))')
    .order('date', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as InstructorReimbursementWithInstructor[]
}

// ── Schedule (range) ─────────────────────────────────────────

export async function getAssignmentsForRange(
  startDate: Date,
  endDate: Date
): Promise<InstructorAssignmentWithInstructor[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('instructor_assignments')
    .select('*, instructor:instructors(*, user:users(*))')
    .gte('scheduled_at', startDate.toISOString())
    .lt('scheduled_at', endDate.toISOString())
    .order('scheduled_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as InstructorAssignmentWithInstructor[]
}
