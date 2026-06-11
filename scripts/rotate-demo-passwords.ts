// Rotate demo-account passwords.
// Run: npx tsx scripts/rotate-demo-passwords.ts
//
// Updates the password of every DEMO account listed below to NEW_PASSWORD.
// It only touches the explicit allow-list — real/production users are never
// modified. Accounts not found in auth are reported and skipped.

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const NEW_PASSWORD = 'Lemat4444'

// Explicit allow-list of demo accounts (admins + instructors + students).
const DEMO_EMAILS = [
  // admins (both historical seed values)
  'admin63@helixdriving.com',
  'admin@mydrive.com',
  // instructors
  'carlos.martinez@helixdriving.com',
  'maria.gonzalez@helixdriving.com',
  'james.wilson@helixdriving.com',
  // students
  'sofia.ramirez@gmail.com',
  'liam.chen@gmail.com',
  'emma.johnson@gmail.com',
  'noah.williams@gmail.com',
  'olivia.brown@gmail.com',
  'ethan.davis@gmail.com',
  'ava.garcia@gmail.com',
  'mason.lee@gmail.com',
]

// Build an email -> user map by paging through all auth users once.
async function buildUserMap() {
  const map = new Map<string, string>()
  let page = 1
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(error.message)
    for (const u of data.users) {
      if (u.email) map.set(u.email.toLowerCase(), u.id)
    }
    if (data.users.length < 1000) break
    page++
  }
  return map
}

async function main() {
  const userMap = await buildUserMap()
  let updated = 0
  const missing: string[] = []

  for (const email of DEMO_EMAILS) {
    const id = userMap.get(email.toLowerCase())
    if (!id) {
      missing.push(email)
      continue
    }
    const { error } = await admin.auth.admin.updateUserById(id, { password: NEW_PASSWORD })
    if (error) {
      console.error(`✗ ${email}: ${error.message}`)
      continue
    }
    console.log(`✓ ${email}`)
    updated++
  }

  console.log(`\nDone. ${updated} password(s) rotated to "${NEW_PASSWORD}".`)
  if (missing.length > 0) {
    console.log(`Not found in auth (skipped): ${missing.join(', ')}`)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
