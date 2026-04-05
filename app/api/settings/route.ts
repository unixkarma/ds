// PATCH /api/settings — update school info and/or Stripe keys (admin only)

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  stripe_publishable_key: z.string().nullable().optional(),
  stripe_secret_key: z.string().nullable().optional(),
  stripe_webhook_secret: z.string().nullable().optional(),
  single_lesson_price_cents: z.number().int().min(0).optional(),
})

export async function PATCH(request: NextRequest) {
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
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  // Build update payload — only include provided fields
  const update: Record<string, unknown> = {}
  const d = parsed.data
  if (d.name !== undefined) update.name = d.name
  if (d.email !== undefined) update.email = d.email
  if (d.phone !== undefined) update.phone = d.phone
  if (d.address !== undefined) update.address = d.address
  if (d.stripe_publishable_key !== undefined) update.stripe_publishable_key = d.stripe_publishable_key
  if (d.stripe_secret_key !== undefined) update.stripe_secret_key = d.stripe_secret_key
  if (d.stripe_webhook_secret !== undefined) update.stripe_webhook_secret = d.stripe_webhook_secret
  if (d.single_lesson_price_cents !== undefined) update.single_lesson_price_cents = d.single_lesson_price_cents

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('schools')
    .update(update)
    .eq('id', profile.school_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
