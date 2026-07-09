'use client'

// Minimal compliance surface (migrations 043/044): CSV exports for state/staff
// reporting and a broadcast composer. CSV routes stream a file download, so a
// plain link/anchor is enough.

import { useState } from 'react'

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function CompliancePage() {
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState(today)

  const [audience, setAudience] = useState<'students' | 'staff'>('students')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [broadcastStatus, setBroadcastStatus] = useState<string | null>(null)

  const sendBroadcast = async () => {
    setBroadcastStatus('Sending…')
    const res = await fetch('/api/broadcasts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audience, subject, body }),
    })
    if (res.ok) {
      const json = await res.json()
      setBroadcastStatus(`Sent to ${json.sent}/${json.recipientCount} recipients`)
      setSubject('')
      setBody('')
    } else {
      setBroadcastStatus('Error sending broadcast')
    }
  }

  return (
    <div className="p-6 space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Compliance &amp; communication</h1>
        <p className="text-sm text-muted-foreground mt-1">
          State reporting exports and bulk messaging.
        </p>
      </div>

      <section className="border rounded-lg p-4 space-y-3">
        <h2 className="font-medium">State exports (CSV)</h2>
        <div className="flex flex-wrap gap-3">
          <a
            href="/api/reports/state-roster"
            className="bg-primary text-primary-foreground rounded-md px-4 py-1.5 text-sm font-medium"
          >
            IL SOS student roster
          </a>
        </div>
      </section>

      <section className="border rounded-lg p-4 space-y-3">
        <h2 className="font-medium">Staff time-off report</h2>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="date"
            value={start}
            onChange={e => setStart(e.target.value)}
            className="border rounded-md px-3 py-1.5 bg-background text-sm"
          />
          <span className="text-muted-foreground">to</span>
          <input
            type="date"
            value={end}
            onChange={e => setEnd(e.target.value)}
            className="border rounded-md px-3 py-1.5 bg-background text-sm"
          />
          <a
            href={`/api/reports/staff-time-off?start=${start}&end=${end}`}
            className="bg-primary text-primary-foreground rounded-md px-4 py-1.5 text-sm font-medium"
          >
            Download CSV
          </a>
        </div>
      </section>

      <section className="border rounded-lg p-4 space-y-3">
        <h2 className="font-medium">Broadcast message</h2>
        <select
          value={audience}
          onChange={e => setAudience(e.target.value as 'students' | 'staff')}
          className="border rounded-md px-3 py-1.5 bg-background text-sm"
        >
          <option value="students">All active students</option>
          <option value="staff">All active staff</option>
        </select>
        <input
          placeholder="Subject"
          value={subject}
          onChange={e => setSubject(e.target.value)}
          className="w-full border rounded-md px-3 py-1.5 bg-background text-sm"
        />
        <textarea
          placeholder="Message"
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={5}
          className="w-full border rounded-md px-3 py-1.5 bg-background text-sm"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={sendBroadcast}
            disabled={!subject || !body}
            className="bg-primary text-primary-foreground rounded-md px-4 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            Send broadcast
          </button>
          {broadcastStatus && <span className="text-sm text-muted-foreground">{broadcastStatus}</span>}
        </div>
      </section>
    </div>
  )
}
