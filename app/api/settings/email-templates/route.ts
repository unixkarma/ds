// GET   /api/settings/email-templates — list this school's template overrides
// PATCH /api/settings/email-templates — upsert one template (admin only)

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthContext } from '@/lib/api-auth'
import { serverError } from '@/lib/api-error'
import { listTemplates, upsertTemplate } from '@/lib/services/communication'

export async function GET() {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const templates = await listTemplates()
    return NextResponse.json({ templates })
  } catch (err) {
    return serverError('GET /api/settings/email-templates', err)
  }
}

const patchSchema = z.object({
  template_key: z.enum(['package_confirmation', 'payment_link', 'day_off_decision']),
  subject: z.string().max(300),
  html_body: z.string().max(100000),
  text_body: z.string().max(100000),
  enabled: z.boolean(),
})

export async function PATCH(request: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = patchSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  try {
    const template = await upsertTemplate(parsed.data)
    return NextResponse.json({ template })
  } catch (err) {
    return serverError('PATCH /api/settings/email-templates', err)
  }
}
