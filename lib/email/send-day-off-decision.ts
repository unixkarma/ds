// Notifies an instructor when an admin approves or rejects their day-off request.
// No-ops silently when RESEND_API_KEY / EMAIL_FROM are not configured.

import { Resend } from 'resend'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveTemplateOverride, sendRawEmail } from '@/lib/email/render'

export type DayOffDecision = 'approved' | 'rejected'

export interface DayOffDecisionEmailArgs {
  to: string
  instructorName: string
  schoolName: string
  schoolEmail: string | null
  decision: DayOffDecision
  date: string          // YYYY-MM-DD
  reason: string | null
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatDate(d: string): string {
  const date = new Date(d + 'T00:00:00')
  return `${DAY_SHORT[date.getDay()]}, ${MONTH_SHORT[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function buildHtml(args: DayOffDecisionEmailArgs): string {
  const approved = args.decision === 'approved'
  const color = approved ? '#16a34a' : '#dc2626'
  const label = approved ? 'Approved' : 'Rejected'
  const message = approved
    ? `Your day off has been approved. Your schedule for that date has been cleared, so no lessons can be booked.`
    : `Your day off request was not approved, so your schedule for that date stays open. Reach out to the school if you have questions.`

  const reasonRow = args.reason
    ? `<tr><td style="padding: 4px 0; color: #6b7280;">Your note</td><td style="padding: 4px 0; text-align: right;">${escapeHtml(args.reason)}</td></tr>`
    : ''

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><title>Day off ${label}</title></head>
<body style="margin: 0; padding: 24px; background: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="width: 100%; max-width: 560px; background: #ffffff; border-radius: 8px; padding: 32px;">
    <tr>
      <td>
        <h1 style="margin: 0 0 4px; font-size: 22px;">Day off <span style="color: ${color};">${label.toLowerCase()}</span></h1>
        <p style="margin: 0; color: #6b7280; font-size: 14px;">${escapeHtml(args.schoolName)}</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 24px 0 0;">
        <p style="margin: 0 0 16px; font-size: 15px;">Hi ${escapeHtml(args.instructorName)},</p>
        <p style="margin: 0; font-size: 15px; line-height: 1.6;">${message}</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 24px 0 0;">
        <div style="background: #f3f4f6; padding: 20px; border-radius: 6px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="font-size: 14px;">
            <tr><td style="padding: 4px 0; color: #6b7280;">Date</td><td style="padding: 4px 0; text-align: right; font-weight: 600;">${formatDate(args.date)}</td></tr>
            <tr><td style="padding: 4px 0; color: #6b7280;">Status</td><td style="padding: 4px 0; text-align: right; font-weight: 700; color: ${color};">${label}</td></tr>
            ${reasonRow}
          </table>
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding: 24px 0 0;">
        <p style="margin: 0; font-size: 13px; color: #6b7280;">
          If you have any questions, just reply to this email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function buildText(args: DayOffDecisionEmailArgs): string {
  const approved = args.decision === 'approved'
  const message = approved
    ? `Your day off has been approved. Your schedule for that date has been cleared.`
    : `Your day off request was not approved, so your schedule for that date stays open.`

  const lines = [
    `Day off ${approved ? 'approved' : 'rejected'} — ${args.schoolName}`,
    '',
    `Hi ${args.instructorName},`,
    '',
    message,
    '',
    `Date: ${formatDate(args.date)}`,
    `Status: ${approved ? 'Approved' : 'Rejected'}`,
  ]
  if (args.reason) lines.push(`Your note: ${args.reason}`)
  return lines.join('\n')
}

export async function sendDayOffDecisionEmail(
  args: DayOffDecisionEmailArgs,
): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM

  if (!apiKey || !from) {
    console.warn('[email] RESEND_API_KEY or EMAIL_FROM missing — skipping day-off decision email')
    return { sent: false, reason: 'email_not_configured' }
  }
  if (!args.to) {
    return { sent: false, reason: 'no_recipient' }
  }

  const label = args.decision === 'approved' ? 'approved' : 'rejected'
  const resend = new Resend(apiKey)
  try {
    await resend.emails.send({
      from,
      to: args.to,
      replyTo: args.schoolEmail || undefined,
      subject: `Your day off on ${formatDate(args.date)} was ${label} — ${args.schoolName}`,
      html: buildHtml(args),
      text: buildText(args),
    })
    return { sent: true }
  } catch (err) {
    console.error('[email] failed to send day-off decision:', err)
    return { sent: false, reason: 'send_failed' }
  }
}

export interface NotifyDayOffDecisionArgs {
  client: SupabaseClient
  schoolId: string
  instructorId: string
  decision: DayOffDecision
  date: string
  reason: string | null
}

export async function notifyDayOffDecision(
  args: NotifyDayOffDecisionArgs,
): Promise<{ sent: boolean; reason?: string; to?: string }> {
  try {
    const { data: instructor } = await args.client
      .from('instructors')
      .select('user:users!user_id(email, first_name, last_name)')
      .eq('id', args.instructorId)
      .single<{ user: { email: string; first_name: string; last_name: string } | null }>()

    const userRow = instructor?.user
    if (!userRow?.email) {
      return { sent: false, reason: 'instructor_has_no_email' }
    }

    const { data: school } = await args.client
      .from('schools')
      .select('name, email')
      .eq('id', args.schoolId)
      .single<{ name: string; email: string | null }>()

    const instructorName = `${userRow.first_name} ${userRow.last_name}`.trim() || 'there'
    const schoolName = school?.name ?? 'Your driving school'

    // School-defined template takes precedence over the hardcoded builder.
    const override = await resolveTemplateOverride(args.client, args.schoolId, 'day_off_decision', {
      instructorName,
      schoolName,
      date: formatDate(args.date),
      decision: args.decision,
      status: args.decision === 'approved' ? 'Approved' : 'Rejected',
      reason: args.reason ?? '',
    })
    if (override) {
      const result = await sendRawEmail({
        to: userRow.email,
        replyTo: school?.email ?? null,
        subject: override.subject,
        html: override.html,
        text: override.text,
      })
      return { ...result, to: userRow.email }
    }

    const result = await sendDayOffDecisionEmail({
      to: userRow.email,
      instructorName,
      schoolName,
      schoolEmail: school?.email ?? null,
      decision: args.decision,
      date: args.date,
      reason: args.reason,
    })

    return { ...result, to: userRow.email }
  } catch (err) {
    console.error('[email] notifyDayOffDecision failed:', err)
    return { sent: false, reason: 'unexpected_error' }
  }
}
