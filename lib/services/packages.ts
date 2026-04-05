// Package service — server-side data fetching.
// All queries are automatically scoped to the current user's school via RLS.

import { createClient } from '@/lib/supabase/server'
import type { Package } from '@/types'

export async function getPackages(): Promise<Package[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('packages')
    .select('*')
    .order('price_cents', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as Package[]
}

export async function getActivePackages(): Promise<Package[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('packages')
    .select('*')
    .eq('is_active', true)
    .order('price_cents', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as Package[]
}
