// Payment service — server-side data fetching.
// All queries are automatically scoped to the current user's school via RLS.

import { createClient } from '@/lib/supabase/server'
import type { PaymentWithRelations } from '@/types'

export async function getPayments(): Promise<PaymentWithRelations[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('payments')
    .select('*, student:students(*, user:users!user_id(*)), package:packages(*)')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as PaymentWithRelations[]
}
