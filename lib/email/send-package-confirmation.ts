// Sends the post-purchase confirmation email with package details + requirements.
// No-ops silently when RESEND_API_KEY / EMAIL_FROM are not configured — emails
// are non-essential and must never block a successful purchase.

import { Resend } from 'resend'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface PackageConfirmationArgs {
  to: string
  studentName: string
  schoolName: string
  schoolEmail: string | null
  packageName: string
  lessonCount: number
  classroomRequired: number
  pricePaidCents: number
  totalPriceCents: number
  discountCents: number
  // Card-processing surcharge passed through on Stripe sales. 0 for
  // cash/check/other and for any legacy Stripe sale predating the fee.
  surchargeCents?: number
  lessonsActivated: number
  requirements: string | null
  receiptUrl: string | null
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

function buildHtml(args: PackageConfirmationArgs): string {
  const {
    studentName,
    schoolName,
    packageName,
    lessonCount,
    classroomRequired,
    pricePaidCents,
    totalPriceCents,
    discountCents,
    lessonsActivated,
    requirements,
    receiptUrl,
  } = args

  const owed = totalPriceCents - discountCents - pricePaidCents
  const isPartial = owed > 0
  const lessonsLocked = lessonCount - lessonsActivated

  const requirementsBlock = requirements
    ? `
      <tr>
        <td style="padding: 24px 0 0;">
          <div style="border-left: 4px solid #f59e0b; background: #fffbeb; padding: 16px 20px; border-radius: 4px;">
            <p style="margin: 0 0 8px; font-weight: 700; color: #92400e; font-size: 14px;">
              ⚠ Important — Package Requirements
            </p>
            <p style="margin: 0; color: #78350f; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(requirements)}</p>
          </div>
        </td>
      </tr>`
    : ''

  const partialBlock = isPartial
    ? `
      <tr>
        <td style="padding: 16px 0 0;">
          <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 12px 16px; border-radius: 4px; color: #991b1b; font-size: 13px;">
            <strong>Outstanding balance: ${fmt(owed)}</strong><br />
            ${lessonsActivated} of ${lessonCount} lessons activated.
            ${lessonsLocked > 0 ? `${lessonsLocked} more will unlock when the balance is paid.` : ''}
          </div>
        </td>
      </tr>`
    : ''

  const discountRow = discountCents > 0
    ? `<tr><td style="padding: 4px 0; color: #6b7280;">Discount</td><td style="padding: 4px 0; text-align: right; color: #059669;">−${fmt(discountCents)}</td></tr>`
    : ''

  const surchargeCents = args.surchargeCents ?? 0
  const surchargeRow = surchargeCents > 0
    ? `<tr><td style="padding: 4px 0; color: #6b7280;">Card processing fee (3%)</td><td style="padding: 4px 0; text-align: right;">${fmt(surchargeCents)}</td></tr>
       <tr><td style="padding: 4px 0; color: #6b7280; border-top: 1px solid #e5e7eb;">Total charged</td><td style="padding: 4px 0; text-align: right; font-weight: 700; border-top: 1px solid #e5e7eb;">${fmt(pricePaidCents + surchargeCents)}</td></tr>`
    : ''

  const classroomRow = classroomRequired > 0
    ? `<tr><td style="padding: 4px 0; color: #6b7280;">Classroom hours required</td><td style="padding: 4px 0; text-align: right;">${classroomRequired}</td></tr>`
    : ''

  const receiptLink = receiptUrl
    ? `<p style="margin: 24px 0 0; font-size: 13px;"><a href="${escapeHtml(receiptUrl)}" style="color: #2563eb;">View Stripe receipt →</a></p>`
    : ''

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><title>Purchase confirmation</title></head>
<body style="margin: 0; padding: 24px; background: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="width: 100%; max-width: 560px; background: #ffffff; border-radius: 8px; padding: 32px;">
    <tr>
      <td>
        <h1 style="margin: 0 0 4px; font-size: 22px;">Purchase confirmed</h1>
        <p style="margin: 0; color: #6b7280; font-size: 14px;">${escapeHtml(schoolName)}</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 24px 0 0;">
        <p style="margin: 0 0 16px; font-size: 15px;">Hi ${escapeHtml(studentName)},</p>
        <p style="margin: 0; font-size: 15px; line-height: 1.6;">
          Thanks for your purchase. Here are the details of your package:
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding: 24px 0 0;">
        <div style="background: #f3f4f6; padding: 20px; border-radius: 6px;">
          <p style="margin: 0 0 12px; font-weight: 700; font-size: 16px;">${escapeHtml(packageName)}</p>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="font-size: 14px;">
            <tr><td style="padding: 4px 0; color: #6b7280;">BTW lessons</td><td style="padding: 4px 0; text-align: right;">${lessonCount}</td></tr>
            ${classroomRow}
            <tr><td style="padding: 4px 0; color: #6b7280;">Price</td><td style="padding: 4px 0; text-align: right;">${fmt(totalPriceCents)}</td></tr>
            ${discountRow}
            <tr><td style="padding: 4px 0; color: #6b7280;">Paid now</td><td style="padding: 4px 0; text-align: right; font-weight: 700;">${fmt(pricePaidCents)}</td></tr>
            ${surchargeRow}
            <tr><td style="padding: 4px 0; color: #6b7280;">Lessons activated</td><td style="padding: 4px 0; text-align: right; font-weight: 700;">${lessonsActivated} / ${lessonCount}</td></tr>
          </table>
        </div>
      </td>
    </tr>
    ${partialBlock}
    ${requirementsBlock}
    <tr>
      <td style="padding: 24px 0 0;">
        ${receiptLink}
        <p style="margin: 16px 0 0; font-size: 13px; color: #6b7280;">
          If you have any questions, just reply to this email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function buildText(args: PackageConfirmationArgs): string {
  const owed = args.totalPriceCents - args.discountCents - args.pricePaidCents
  const lines = [
    `Purchase confirmed — ${args.schoolName}`,
    '',
    `Hi ${args.studentName},`,
    '',
    `Thanks for your purchase. Details:`,
    '',
    `Package: ${args.packageName}`,
    `BTW lessons: ${args.lessonCount}`,
  ]
  if (args.classroomRequired > 0) lines.push(`Classroom hours required: ${args.classroomRequired}`)
  lines.push(`Price: ${fmt(args.totalPriceCents)}`)
  if (args.discountCents > 0) lines.push(`Discount: -${fmt(args.discountCents)}`)
  lines.push(`Paid now: ${fmt(args.pricePaidCents)}`)
  const surchargeCents = args.surchargeCents ?? 0
  if (surchargeCents > 0) {
    lines.push(`Card processing fee (3%): ${fmt(surchargeCents)}`)
    lines.push(`Total charged: ${fmt(args.pricePaidCents + surchargeCents)}`)
  }
  lines.push(`Lessons activated: ${args.lessonsActivated} / ${args.lessonCount}`)
  if (owed > 0) {
    lines.push('', `Outstanding balance: ${fmt(owed)}`)
  }
  if (args.requirements) {
    lines.push('', 'IMPORTANT — REQUIREMENTS:', args.requirements)
  }
  if (args.receiptUrl) lines.push('', `Stripe receipt: ${args.receiptUrl}`)
  return lines.join('\n')
}

export async function sendPackageConfirmationEmail(args: PackageConfirmationArgs): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM

  if (!apiKey || !from) {
    console.warn('[email] RESEND_API_KEY or EMAIL_FROM missing — skipping confirmation email')
    return
  }
  if (!args.to) {
    console.warn('[email] no recipient — skipping confirmation email')
    return
  }

  const resend = new Resend(apiKey)
  try {
    await resend.emails.send({
      from,
      to: args.to,
      replyTo: args.schoolEmail || undefined,
      subject: `Your ${args.packageName} purchase — ${args.schoolName}`,
      html: buildHtml(args),
      text: buildText(args),
    })
  } catch (err) {
    console.error('[email] failed to send package confirmation:', err)
  }
}

// Higher-level helper called from API routes after a successful sale. Fetches
// the student's email + name and the school's name/email, then sends. Safe to
// invoke without awaiting — any failure is swallowed and logged so it never
// breaks the purchase response.
export interface NotifyPurchaseArgs {
  client: SupabaseClient
  schoolId: string
  studentId: string
  packageName: string
  lessonCount: number
  classroomRequired: number
  pricePaidCents: number
  totalPriceCents: number
  discountCents: number
  surchargeCents?: number
  lessonsActivated: number
  requirements: string | null
  receiptUrl: string | null
}

export async function notifyPackagePurchase(args: NotifyPurchaseArgs): Promise<void> {
  try {
    const { data: student } = await args.client
      .from('students')
      .select('user:users!user_id(email, first_name, last_name)')
      .eq('id', args.studentId)
      .single<{ user: { email: string; first_name: string; last_name: string } | null }>()

    const userRow = student?.user
    if (!userRow?.email) {
      console.warn('[email] student has no user email — skipping confirmation', args.studentId)
      return
    }

    const { data: school } = await args.client
      .from('schools')
      .select('name, email')
      .eq('id', args.schoolId)
      .single<{ name: string; email: string | null }>()

    await sendPackageConfirmationEmail({
      to: userRow.email,
      studentName: `${userRow.first_name} ${userRow.last_name}`.trim() || 'there',
      schoolName: school?.name ?? 'Your driving school',
      schoolEmail: school?.email ?? null,
      packageName: args.packageName,
      lessonCount: args.lessonCount,
      classroomRequired: args.classroomRequired,
      pricePaidCents: args.pricePaidCents,
      totalPriceCents: args.totalPriceCents,
      discountCents: args.discountCents,
      surchargeCents: args.surchargeCents,
      lessonsActivated: args.lessonsActivated,
      requirements: args.requirements,
      receiptUrl: args.receiptUrl,
    })
  } catch (err) {
    console.error('[email] notifyPackagePurchase failed:', err)
  }
}
