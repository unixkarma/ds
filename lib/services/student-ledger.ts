// Student ledger service — append-only journal of charges, payments and
// manual adjustments. Balance = SUM(amount_cents):
//   positive = student owes the school
//   negative = student has a credit
// All read queries are scoped via RLS (admin sees own school; student sees own rows).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type {
  StudentLedgerEntry,
  LedgerEntryType,
  LedgerPaymentMethod,
} from '@/types'

// ── Reads ────────────────────────────────────────────────────

export async function getStudentBalanceCents(studentId: string): Promise<number> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('student_ledger')
    .select('amount_cents')
    .eq('student_id', studentId)

  if (error) throw new Error(error.message)
  return (data ?? []).reduce((sum, row) => sum + Number(row.amount_cents), 0)
}

export async function getStudentLedger(
  studentId: string
): Promise<StudentLedgerEntry[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('student_ledger')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as StudentLedgerEntry[]
}

// Batch balance lookup for reports — returns Map<studentId, balanceCents>.
export async function getBalancesForStudents(
  studentIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (studentIds.length === 0) return map

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('student_ledger')
    .select('student_id, amount_cents')
    .in('student_id', studentIds)

  if (error) throw new Error(error.message)

  for (const row of data ?? []) {
    const prev = map.get(row.student_id) ?? 0
    map.set(row.student_id, prev + Number(row.amount_cents))
  }
  return map
}

// ── Writes ───────────────────────────────────────────────────
// All writers take an explicit Supabase client so callers can decide
// whether the entry should be inserted through RLS (admin client in an
// API route) or with the service role (webhook).

export interface LedgerInsertArgs {
  client: SupabaseClient
  schoolId: string
  studentId: string
  amountCents: number              // positive = charge; negative = payment/credit
  entryType: LedgerEntryType
  description: string
  paymentMethod?: LedgerPaymentMethod | null
  paymentId?: string | null
  packageId?: string | null
  createdBy?: string | null
}

export async function insertLedgerEntry(
  args: LedgerInsertArgs
): Promise<{ id: string }> {
  const {
    client,
    schoolId,
    studentId,
    amountCents,
    entryType,
    description,
    paymentMethod = null,
    paymentId = null,
    packageId = null,
    createdBy = null,
  } = args

  const { data, error } = await client
    .from('student_ledger')
    .insert({
      school_id: schoolId,
      student_id: studentId,
      amount_cents: amountCents,
      entry_type: entryType,
      description,
      payment_method: paymentMethod,
      payment_id: paymentId,
      package_id: packageId,
      created_by: createdBy,
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to insert ledger entry')
  }
  return { id: data.id }
}
