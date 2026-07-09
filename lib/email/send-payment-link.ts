// Sends an admin-generated Stripe Checkout link to the student so they can
// pay by card — either for a package or to pay down their outstanding
// account balance. The link points at Stripe's hosted checkout, so no card
// data ever touches our app.
// No-ops silently when RESEND_API_KEY / EMAIL_FROM are not configured.

import { Resend } from 'resend'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveTemplateOverride, sendRawEmail } from '@/lib/email/render'

export type PaymentLinkMode = 'package' | 'balance'

export interface PaymentLinkEmailArgs {
  to: string
  studentName: string
  schoolName: string
  schoolEmail: string | null
  mode: PaymentLinkMode
  packageName: string | null   // null for balance mode
  lessonCount: number          // 0 for balance mode
  priceCents: number           // base amount (package list or balance)
  surchargeCents: number       // 3% card processing fee
  totalCents: number           // what Stripe will actually charge
  checkoutUrl: string
}

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function buildHtml(args: PaymentLinkEmailArgs): string {
  const isPackage = args.mode === 'package'
  const heading = isPackage
    ? `We've prepared a secure payment link for the package below. Click the button to pay by credit or debit card.`
    : `We've prepared a secure payment link to pay down your account balance. Click the button to pay by credit or debit card.`

  const itemTitle = isPackage
    ? escapeHtml(args.packageName ?? 'Package')
    : 'Account balance payment'

  const lessonsRow = isPackage
    ? `<tr><td style="padding: 4px 0; color: #6b7280;">BTW lessons</td><td style="padding: 4px 0; text-align: right;">${args.lessonCount}</td></tr>`
    : ''

  const baseLabel = isPackage ? 'Package' : 'Amount'

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><title>Payment link</title></head>
<body style="margin: 0; padding: 24px; background: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="width: 100%; max-width: 560px; background: #ffffff; border-radius: 8px; padding: 32px;">
    <tr>
      <td>
        <h1 style="margin: 0 0 4px; font-size: 22px;">Complete your payment</h1>
        <p style="margin: 0; color: #6b7280; font-size: 14px;">${escapeHtml(args.schoolName)}</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 24px 0 0;">
        <p style="margin: 0 0 16px; font-size: 15px;">Hi ${escapeHtml(args.studentName)},</p>
        <p style="margin: 0; font-size: 15px; line-height: 1.6;">${heading}</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 24px 0 0;">
        <div style="background: #f3f4f6; padding: 20px; border-radius: 6px;">
          <p style="margin: 0 0 12px; font-weight: 700; font-size: 16px;">${itemTitle}</p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="font-size: 14px;">
            ${lessonsRow}
            <tr><td style="padding: 4px 0; color: #6b7280;">${baseLabel}</td><td style="padding: 4px 0; text-align: right;">${fmt(args.priceCents)}</td></tr>
            <tr><td style="padding: 4px 0; color: #6b7280;">Card processing fee (3%)</td><td style="padding: 4px 0; text-align: right;">${fmt(args.surchargeCents)}</td></tr>
            <tr><td style="padding: 4px 0; color: #6b7280; border-top: 1px solid #e5e7eb;">Total</td><td style="padding: 4px 0; text-align: right; font-weight: 700; border-top: 1px solid #e5e7eb;">${fmt(args.totalCents)}</td></tr>
          </table>
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding: 24px 0 0; text-align: center;">
        <a href="${escapeHtml(args.checkoutUrl)}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 12px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px;">Pay ${fmt(args.totalCents)}</a>
      </td>
    </tr>
    <tr>
      <td style="padding: 16px 0 0;">
        <p style="margin: 0; font-size: 12px; color: #6b7280; line-height: 1.6; text-align: center;">
          Or copy and paste this URL into your browser:<br />
          <span style="color: #2563eb; word-break: break-all;">${escapeHtml(args.checkoutUrl)}</span>
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding: 24px 0 0;">
        <p style="margin: 0; font-size: 13px; color: #6b7280;">
          The link expires in 24 hours. If you have any questions, just reply to this email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function buildText(args: PaymentLinkEmailArgs): string {
  const isPackage = args.mode === 'package'
  const intro = isPackage
    ? `We've prepared a secure payment link for the package below.`
    : `We've prepared a secure payment link to pay down your account balance.`

  const lines = [
    `Complete your payment — ${args.schoolName}`,
    '',
    `Hi ${args.studentName},`,
    '',
    intro,
    '',
  ]
  if (isPackage) {
    lines.push(`Package: ${args.packageName ?? ''}`)
    lines.push(`BTW lessons: ${args.lessonCount}`)
    lines.push(`Package price: ${fmt(args.priceCents)}`)
  } else {
    lines.push(`Account balance payment`)
    lines.push(`Amount: ${fmt(args.priceCents)}`)
  }
  lines.push(
    `Card processing fee (3%): ${fmt(args.surchargeCents)}`,
    `Total: ${fmt(args.totalCents)}`,
    '',
    `Pay here: ${args.checkoutUrl}`,
    '',
    `The link expires in 24 hours.`,
  )
  return lines.join('\n')
}

export async function sendPaymentLinkEmail(args: PaymentLinkEmailArgs): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM

  if (!apiKey || !from) {
    console.warn('[email] RESEND_API_KEY or EMAIL_FROM missing — skipping payment link email')
    return { sent: false, reason: 'email_not_configured' }
  }
  if (!args.to) {
    return { sent: false, reason: 'no_recipient' }
  }

  const subjectLabel = args.mode === 'package'
    ? `Payment link for ${args.packageName ?? 'your package'}`
    : `Payment link for your account balance`

  const resend = new Resend(apiKey)
  try {
    await resend.emails.send({
      from,
      to: args.to,
      replyTo: args.schoolEmail || undefined,
      subject: `${subjectLabel} — ${args.schoolName} (${fmt(args.totalCents)})`,
      html: buildHtml(args),
      text: buildText(args),
    })
    return { sent: true }
  } catch (err) {
    console.error('[email] failed to send payment link:', err)
    return { sent: false, reason: 'send_failed' }
  }
}

export interface NotifyPaymentLinkArgs {
  client: SupabaseClient
  schoolId: string
  studentId: string
  mode: PaymentLinkMode
  packageName: string | null
  lessonCount: number
  priceCents: number
  surchargeCents: number
  totalCents: number
  checkoutUrl: string
}

export async function notifyPaymentLink(
  args: NotifyPaymentLinkArgs,
): Promise<{ sent: boolean; reason?: string; to?: string }> {
  try {
    const { data: student } = await args.client
      .from('students')
      .select('user:users!user_id(email, first_name, last_name)')
      .eq('id', args.studentId)
      .single<{ user: { email: string; first_name: string; last_name: string } | null }>()

    const userRow = student?.user
    if (!userRow?.email) {
      return { sent: false, reason: 'student_has_no_email' }
    }

    const { data: school } = await args.client
      .from('schools')
      .select('name, email')
      .eq('id', args.schoolId)
      .single<{ name: string; email: string | null }>()

    const studentName = `${userRow.first_name} ${userRow.last_name}`.trim() || 'there'
    const schoolName = school?.name ?? 'Your driving school'

    // School-defined template takes precedence over the hardcoded builder.
    const override = await resolveTemplateOverride(args.client, args.schoolId, 'payment_link', {
      studentName,
      schoolName,
      packageName: args.packageName ?? '',
      lessonCount: String(args.lessonCount),
      price: `$${(args.priceCents / 100).toFixed(2)}`,
      surcharge: `$${(args.surchargeCents / 100).toFixed(2)}`,
      total: `$${(args.totalCents / 100).toFixed(2)}`,
      checkoutUrl: args.checkoutUrl,
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

    const result = await sendPaymentLinkEmail({
      to: userRow.email,
      studentName,
      schoolName,
      schoolEmail: school?.email ?? null,
      mode: args.mode,
      packageName: args.packageName,
      lessonCount: args.lessonCount,
      priceCents: args.priceCents,
      surchargeCents: args.surchargeCents,
      totalCents: args.totalCents,
      checkoutUrl: args.checkoutUrl,
    })

    return { ...result, to: userRow.email }
  } catch (err) {
    console.error('[email] notifyPaymentLink failed:', err)
    return { sent: false, reason: 'unexpected_error' }
  }
}
