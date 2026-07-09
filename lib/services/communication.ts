// Communication Center service (migration 043).
// - Per-student messages (email channel) with a persisted log.
// - Bulk broadcasts to students or staff.
// - CRUD for editable email templates.
//
// All reads/writes go through the RLS-scoped server client, so the caller's
// school and role are enforced by Postgres. API routes still gate on role for
// clear 401/403s before we get here.

import { createClient } from '@/lib/supabase/server'
import { sendRawEmail } from '@/lib/email/render'
import type { EmailTemplate, EmailTemplateKey, Message } from '@/types'

interface Ctx {
  userId: string
  schoolId: string
  role: string
}

async function requireContext(): Promise<Ctx> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('users')
    .select('role, school_id')
    .eq('id', user.id)
    .single<{ role: string; school_id: string }>()

  if (!profile) throw new Error('Profile not found')
  return { userId: user.id, schoolId: profile.school_id, role: profile.role }
}

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

// Wraps a plain-text admin message body into a minimal branded HTML email.
function wrapHtml(schoolName: string, subject: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="width:100%;max-width:560px;background:#fff;border-radius:8px;padding:32px;">
    <tr><td><p style="margin:0 0 16px;color:#6b7280;font-size:14px;">${escapeHtml(schoolName)}</p>
    <div style="font-size:15px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(body)}</div></td></tr>
  </table>
</body>
</html>`
}

export async function listStudentMessages(studentId: string): Promise<Message[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as Message[]
}

export interface SendStudentMessageArgs {
  studentId: string
  subject: string
  body: string
}

// Sends an email to a student and records the message. If email is not
// configured (or the send fails) the row is still logged with status 'failed'
// so the admin sees the attempt.
export async function sendStudentMessage(
  args: SendStudentMessageArgs,
): Promise<Message> {
  const ctx = await requireContext()
  const supabase = await createClient()

  const { data: student } = await supabase
    .from('students')
    .select('id, school_id, user:users!user_id(email, first_name, last_name)')
    .eq('id', args.studentId)
    .single<{
      id: string
      school_id: string
      user: { email: string; first_name: string; last_name: string } | null
    }>()

  if (!student) throw new Error('Student not found')

  const { data: school } = await supabase
    .from('schools')
    .select('name, email')
    .eq('id', ctx.schoolId)
    .single<{ name: string; email: string | null }>()

  const schoolName = school?.name ?? 'Your driving school'
  let status: Message['status'] = 'failed'

  if (student.user?.email) {
    const result = await sendRawEmail({
      to: student.user.email,
      replyTo: school?.email ?? null,
      subject: args.subject,
      html: wrapHtml(schoolName, args.subject, args.body),
      text: args.body,
    })
    status = result.sent ? 'sent' : 'failed'
  }

  const { data: inserted, error } = await supabase
    .from('messages')
    .insert({
      school_id: ctx.schoolId,
      student_id: args.studentId,
      direction: 'outbound',
      channel: 'email',
      subject: args.subject,
      body: args.body,
      status,
      sent_by: ctx.userId,
    })
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return inserted as Message
}

export interface SendBroadcastArgs {
  audience: 'students' | 'staff'
  subject: string
  body: string
}

export async function sendBroadcast(
  args: SendBroadcastArgs,
): Promise<{ recipientCount: number; sent: number }> {
  const ctx = await requireContext()
  const supabase = await createClient()

  const { data: school } = await supabase
    .from('schools')
    .select('name, email')
    .eq('id', ctx.schoolId)
    .single<{ name: string; email: string | null }>()
  const schoolName = school?.name ?? 'Your driving school'

  // Resolve recipient emails for the audience. (supabase-js infers embedded
  // joins as arrays, so we override the result shape — the FK is to-one.)
  let emails: string[] = []
  if (args.audience === 'students') {
    const { data } = await supabase
      .from('students')
      .select('user:users!user_id(email)')
      .eq('status', 'active')
    const rows = (data ?? []) as unknown as Array<{ user: { email: string } | null }>
    emails = rows.map(r => r.user?.email).filter((e): e is string => !!e)
  } else {
    const { data } = await supabase
      .from('instructors')
      .select('user:users!user_id(email)')
      .eq('is_active', true)
    const rows = (data ?? []) as unknown as Array<{ user: { email: string } | null }>
    emails = rows.map(r => r.user?.email).filter((e): e is string => !!e)
  }

  const unique = Array.from(new Set(emails))
  let sent = 0
  for (const to of unique) {
    const result = await sendRawEmail({
      to,
      replyTo: school?.email ?? null,
      subject: args.subject,
      html: wrapHtml(schoolName, args.subject, args.body),
      text: args.body,
    })
    if (result.sent) sent++
  }

  await supabase.from('broadcasts').insert({
    school_id: ctx.schoolId,
    audience: args.audience,
    subject: args.subject,
    body: args.body,
    recipient_count: unique.length,
    sent_by: ctx.userId,
  })

  return { recipientCount: unique.length, sent }
}

export async function listTemplates(): Promise<EmailTemplate[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('email_templates')
    .select('*')
    .order('template_key', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as EmailTemplate[]
}

export interface UpsertTemplateArgs {
  template_key: EmailTemplateKey
  subject: string
  html_body: string
  text_body: string
  enabled: boolean
}

export async function upsertTemplate(args: UpsertTemplateArgs): Promise<EmailTemplate> {
  const ctx = await requireContext()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('email_templates')
    .upsert(
      {
        school_id: ctx.schoolId,
        template_key: args.template_key,
        subject: args.subject,
        html_body: args.html_body,
        text_body: args.text_body,
        enabled: args.enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'school_id,template_key' },
    )
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return data as EmailTemplate
}
