// GET /api/packages — list packages for the current school
// POST /api/packages — create a new package (admin only)

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().default(''),
  lesson_count: z.number().int().positive(),
  price_cents: z.number().int().positive(),
  program_type: z.enum(['teen', 'adult', 'both']).default('both'),
})

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('packages')
    .select('*')
    .order('price_cents', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ packages: data })
}

export async function POST(request: NextRequest) {
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
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const adminClient = createAdminClient()
  const { data: pkg, error } = await adminClient
    .from('packages')
    .insert({
      school_id: profile.school_id,
      ...parsed.data,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ package: pkg }, { status: 201 })
}
