'use client'

// Minimal editor for per-school email template overrides (migration 043).
// One card per template key; saving upserts via PATCH. When a template is
// disabled or blank, the hardcoded lib/email builder is used as fallback.
// Bodies support {{var}} tokens — see each key's builder for available names.

import { useEffect, useState } from 'react'
import type { EmailTemplate, EmailTemplateKey } from '@/types'

const KEYS: { key: EmailTemplateKey; label: string; vars: string }[] = [
  { key: 'package_confirmation', label: 'Package confirmation', vars: 'studentName, schoolName, packageName, lessonCount, lessonsActivated, pricePaid, totalPrice, discount, requirements, receiptUrl' },
  { key: 'payment_link', label: 'Payment link', vars: 'studentName, schoolName, packageName, lessonCount, price, surcharge, total, checkoutUrl' },
  { key: 'day_off_decision', label: 'Day-off decision', vars: 'instructorName, schoolName, date, decision, status, reason' },
]

interface Draft {
  subject: string
  html_body: string
  text_body: string
  enabled: boolean
}

const emptyDraft = (): Draft => ({ subject: '', html_body: '', text_body: '', enabled: false })

export default function EmailTemplatesPage() {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [status, setStatus] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/settings/email-templates')
        const json = await res.json()
        const map: Record<string, Draft> = {}
        for (const k of KEYS) map[k.key] = emptyDraft()
        for (const t of (json.templates ?? []) as EmailTemplate[]) {
          map[t.template_key] = {
            subject: t.subject,
            html_body: t.html_body,
            text_body: t.text_body,
            enabled: t.enabled,
          }
        }
        setDrafts(map)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const save = async (key: EmailTemplateKey) => {
    setStatus(s => ({ ...s, [key]: 'Saving…' }))
    const res = await fetch('/api/settings/email-templates', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_key: key, ...drafts[key] }),
    })
    setStatus(s => ({ ...s, [key]: res.ok ? 'Saved' : 'Error saving' }))
  }

  const update = (key: string, patch: Partial<Draft>) =>
    setDrafts(d => ({ ...d, [key]: { ...d[key], ...patch } }))

  if (loading) return <p className="p-6 text-muted-foreground">Loading…</p>

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Email templates</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Override the default emails. Leave disabled or blank to use the built-in template.
        </p>
      </div>

      {KEYS.map(({ key, label, vars }) => {
        const d = drafts[key] ?? emptyDraft()
        return (
          <div key={key} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">{label}</h2>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={d.enabled}
                  onChange={e => update(key, { enabled: e.target.checked })}
                />
                Enabled
              </label>
            </div>
            <p className="text-xs text-muted-foreground">Variables: {vars}</p>
            <input
              placeholder="Subject"
              value={d.subject}
              onChange={e => update(key, { subject: e.target.value })}
              className="w-full border rounded-md px-3 py-1.5 bg-background text-sm"
            />
            <textarea
              placeholder="HTML body"
              value={d.html_body}
              onChange={e => update(key, { html_body: e.target.value })}
              rows={5}
              className="w-full border rounded-md px-3 py-1.5 bg-background text-sm font-mono"
            />
            <textarea
              placeholder="Plain-text body (falls back to HTML if blank)"
              value={d.text_body}
              onChange={e => update(key, { text_body: e.target.value })}
              rows={3}
              className="w-full border rounded-md px-3 py-1.5 bg-background text-sm font-mono"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={() => save(key)}
                className="bg-primary text-primary-foreground rounded-md px-4 py-1.5 text-sm font-medium"
              >
                Save
              </button>
              {status[key] && <span className="text-sm text-muted-foreground">{status[key]}</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
