// Runs once when the Next.js server boots.
// Sets the process timezone from APP_TZ since Vercel reserves the TZ env name.
// Without this, server-side Date math runs in UTC on Vercel and is shifted
// 5–6 hours off vs. the user's browser (CT).
//
// Modern Node.js honors process.env.TZ when it's changed at runtime, as long
// as no Date math has happened yet that depends on the previous value.
// This file is the earliest hook Next.js exposes, so it's safe.

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const tz = process.env.APP_TZ ?? 'America/Chicago'
    process.env.TZ = tz
  }
}
