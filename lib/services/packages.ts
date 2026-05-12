// Package service — server-side data fetching.
// All queries are automatically scoped to the current user's school via RLS.

import { createClient } from '@/lib/supabase/server'
import type { AgeGroup, Package } from '@/types'

export async function getPackages(): Promise<Package[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('packages')
    .select('*')
    .order('price_cents', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as Package[]
}

// When `forAgeGroup` is passed, returns only packages matching that age
// (teen → 'teen' | 'both'; adult → 'adult' | 'both'). Admin contexts
// should pass nothing to get all active packages.
export async function getActivePackages(
  forAgeGroup?: AgeGroup
): Promise<Package[]> {
  const supabase = await createClient()

  let query = supabase
    .from('packages')
    .select('*')
    .eq('is_active', true)

  if (forAgeGroup) {
    query = query.in('program_type', [forAgeGroup, 'both'])
  }

  const { data, error } = await query.order('price_cents', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as Package[]
}
