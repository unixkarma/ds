// PATCH  /api/opening-templates/[id] — update name/slots
// DELETE /api/opening-templates/[id] — remove template
// Authorization (also enforced by RLS):
//   - Instructor: their own templates only (instructor_id matches their instructor.id)
//   - Admin: any template in their school

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { regenerateOpenings } from '@/lib/services/openings-generator'

const slotSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/, 'Format must be HH:MM'),
  duration_min: z.number().int().min(15).max(240),
})

const updateSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  slots: z.array(slotSchema).min(1).optional(),
  day_of_week: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
})

async function regenerateForTemplate(
  schoolId: string,
  templateInstructorId: string | null
) {
  // School-level templates (instructor_id IS NULL) are starters/inspiration only —
  // they don't auto-apply, so no regeneration needed.
  if (templateInstructorId) {
    await regenerateOpenings({ instructorId: templateInstructorId, schoolId })
  }
}

async function loadContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { data: profile } = await supabase
    .from('users')
    .select('role, school_id')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  return { supabase, user, profile }
}

async function canModify(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  role: string,
  schoolId: string,
  templateId: string
) {
  const { data: tpl } = await supabase
    .from('opening_templates')
    .select('id, school_id, instructor_id')
    .eq('id', templateId)
    .single()

  if (!tpl) return { ok: false, status: 404 as const, msg: 'Template not found' }
  if (tpl.school_id !== schoolId) return { ok: false, status: 404 as const, msg: 'Template not found' }

  if (role === 'admin') return { ok: true as const, tpl }

  // Instructor — must own the template
  const { data: instructor } = await supabase
    .from('instructors')
    .select('id')
    .eq('user_id', userId)
    .single()
  if (!instructor || tpl.instructor_id !== instructor.id) {
    return { ok: false, status: 403 as const, msg: 'You can only modify your own templates' }
  }
  return { ok: true as const, tpl }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const ctx = await loadContext()
  if ('error' in ctx) return ctx.error

  const body = await request.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const auth = await canModify(ctx.supabase, ctx.user.id, ctx.profile.role, ctx.profile.school_id, id)
  if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status })

  const update: Record<string, unknown> = {}
  if (parsed.data.name !== undefined) update.name = parsed.data.name
  if (parsed.data.slots !== undefined) update.slots = parsed.data.slots
  if (parsed.data.day_of_week !== undefined) update.day_of_week = parsed.data.day_of_week

  const adminClient = createAdminClient()
  const { data: tpl, error } = await adminClient
    .from('opening_templates')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'A template with this name already exists.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await regenerateForTemplate(ctx.profile.school_id, auth.tpl!.instructor_id)

  return NextResponse.json({ template: tpl })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const ctx = await loadContext()
  if ('error' in ctx) return ctx.error

  const auth = await canModify(ctx.supabase, ctx.user.id, ctx.profile.role, ctx.profile.school_id, id)
  if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status })

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('opening_templates')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await regenerateForTemplate(ctx.profile.school_id, auth.tpl!.instructor_id)

  return NextResponse.json({ ok: true })
}
