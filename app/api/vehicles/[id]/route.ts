// PATCH /api/vehicles/[id] — update vehicle details or toggle active status (admin only)

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const updateVehicleSchema = z.object({
  make: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  year: z.string().optional(),
  licensePlate: z.string().optional(),
  isActive: z.boolean().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('role, school_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = updateVehicleSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  // Verify the vehicle belongs to this school
  const { data: existing } = await supabase
    .from('vehicles')
    .select('id')
    .eq('id', id)
    .eq('school_id', profile.school_id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 })

  const updates = parsed.data
  const vehicleUpdates: Record<string, unknown> = {}
  if (updates.make !== undefined) vehicleUpdates.make = updates.make
  if (updates.model !== undefined) vehicleUpdates.model = updates.model
  if (updates.year !== undefined) vehicleUpdates.year = parseInt(updates.year, 10)
  if (updates.licensePlate !== undefined) vehicleUpdates.license_plate = updates.licensePlate
  if (updates.isActive !== undefined) vehicleUpdates.is_active = updates.isActive

  const adminClient = createAdminClient()

  const { error } = await adminClient
    .from('vehicles')
    .update(vehicleUpdates)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
