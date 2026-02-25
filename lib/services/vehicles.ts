// Vehicles service — server-side data fetching scoped by RLS.

import { createClient } from '@/lib/supabase/server'
import type { Vehicle } from '@/types'

export async function getVehicles(): Promise<Vehicle[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .order('make', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as Vehicle[]
}
