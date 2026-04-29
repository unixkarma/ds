// GET /api/cron/regenerate-openings
//   Daily Vercel cron — keeps the rolling 14-day window of openings fresh.
//   Iterates every active instructor in every school and regenerates.
//
// Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` automatically when
// the route is registered in vercel.json. We verify the header to block public abuse.
//
// Set CRON_SECRET in Vercel env vars (a random 32+ char string).

import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { regenerateOpenings } from '@/lib/services/openings-generator'

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data: instructors, error } = await admin
    .from('instructors')
    .select('id, school_id')
    .eq('is_active', true)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results = []
  let totalCreated = 0
  let totalDeleted = 0

  for (const inst of instructors ?? []) {
    try {
      const r = await regenerateOpenings({
        instructorId: inst.id,
        schoolId: inst.school_id,
      })
      results.push(r)
      totalCreated += r.created
      totalDeleted += r.deleted
    } catch (e) {
      // Log but keep going so one bad instructor doesn't break the whole sweep.
      console.error(`[cron] regen failed for instructor ${inst.id}:`, e)
      results.push({ instructorId: inst.id, error: (e as Error).message })
    }
  }

  return NextResponse.json({
    instructors: results.length,
    totalCreated,
    totalDeleted,
    results,
  })
}
