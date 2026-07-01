// IP-based rate limiting for public, unauthenticated endpoints.
//
// Backed by Upstash Redis (works on serverless / Fluid Compute where in-memory
// counters don't survive across instances). Provision it one-click via the
// Vercel Marketplace → Upstash integration, which auto-sets the env vars below.
//
// GRACEFUL DEGRADATION: if the Upstash env vars are absent (e.g. local dev, or
// before the integration is provisioned) the limiter FAILS OPEN — it allows the
// request but logs a one-time warning. This keeps dev frictionless, but it means
// production MUST have the env vars set for the protection to be real. The
// health of this is worth asserting in the deploy checklist.

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const url = process.env.UPSTASH_REDIS_REST_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN

let redis: Redis | null = null
if (url && token) {
  redis = new Redis({ url, token })
} else if (process.env.NODE_ENV === 'production') {
  console.warn(
    '[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN not set — rate limiting is DISABLED. ' +
      'Public endpoints are unprotected. Provision the Upstash integration on Vercel.'
  )
}

// A limiter per logical use-case. Sliding window keeps bursts honest.
const limiters = redis
  ? {
      // Student self-registration: creates auth users. Tight.
      register: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, '1 h'),
        prefix: 'rl:register',
      }),
      // Instructor application: accepts 10 MB file uploads. Tighter.
      application: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(3, '1 h'),
        prefix: 'rl:application',
      }),
    }
  : null

export type RateLimitBucket = 'register' | 'application'

/**
 * Extract the best-guess client IP from a request. On Vercel the first entry of
 * `x-forwarded-for` is the real client IP.
 */
export function clientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}

/**
 * Returns `{ success }`. When Redis isn't configured this fails open
 * (`success: true`) — see the module note. Callers should return HTTP 429 on
 * `success: false`.
 */
export async function checkRateLimit(
  bucket: RateLimitBucket,
  identifier: string
): Promise<{ success: boolean }> {
  if (!limiters) return { success: true }
  const { success } = await limiters[bucket].limit(identifier)
  return { success }
}
