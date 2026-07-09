// Shared helpers for editable email templates (migration 043).
//
// Each notifyX in lib/email/* first asks resolveTemplateOverride() whether the
// school has an ENABLED row in email_templates for its key. If so, that
// subject/html/text (with {{var}} interpolation) is sent via sendRawEmail and
// the hardcoded builder is skipped. If not, the caller falls back to its
// existing builder — so nothing breaks when no template row exists.

import { Resend } from 'resend'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EmailTemplateKey } from '@/types'

// Replaces {{key}} tokens with vars[key]. Unknown tokens are left as-is so a
// typo in a template is visible rather than silently blanking content.
export function interpolate(input: string, vars: Record<string, string>): string {
  return input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match,
  )
}

export interface ResolvedTemplate {
  subject: string
  html: string
  text: string
}

// Returns the interpolated override for (schoolId, key) when a row exists and
// is enabled; otherwise null (→ caller uses its hardcoded builder).
export async function resolveTemplateOverride(
  client: SupabaseClient,
  schoolId: string,
  key: EmailTemplateKey,
  vars: Record<string, string>,
): Promise<ResolvedTemplate | null> {
  try {
    const { data } = await client
      .from('email_templates')
      .select('subject, html_body, text_body, enabled')
      .eq('school_id', schoolId)
      .eq('template_key', key)
      .maybeSingle<{ subject: string; html_body: string; text_body: string; enabled: boolean }>()

    if (!data || !data.enabled || !data.html_body) return null

    return {
      subject: interpolate(data.subject, vars),
      html: interpolate(data.html_body, vars),
      text: interpolate(data.text_body || data.html_body, vars),
    }
  } catch (err) {
    // Never let a template lookup failure block the real email — fall back.
    console.error('[email] resolveTemplateOverride failed:', err)
    return null
  }
}

// Low-level send used both for template overrides and for ad-hoc messages
// (Communication Center). No-ops silently when Resend env is missing.
export async function sendRawEmail(args: {
  to: string
  replyTo?: string | null
  subject: string
  html: string
  text: string
}): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM

  if (!apiKey || !from) {
    console.warn('[email] RESEND_API_KEY or EMAIL_FROM missing — skipping email')
    return { sent: false, reason: 'email_not_configured' }
  }
  if (!args.to) return { sent: false, reason: 'no_recipient' }

  const resend = new Resend(apiKey)
  try {
    await resend.emails.send({
      from,
      to: args.to,
      replyTo: args.replyTo || undefined,
      subject: args.subject,
      html: args.html,
      text: args.text,
    })
    return { sent: true }
  } catch (err) {
    console.error('[email] sendRawEmail failed:', err)
    return { sent: false, reason: 'send_failed' }
  }
}
