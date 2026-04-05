// Stripe client factory — each school has their own Stripe account.
// Pass the school's secret key to create an instance for that school.
import Stripe from 'stripe'

export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: '2026-01-28.clover',
    typescript: true,
  })
}

// Helper: format cents to display string (e.g. 4999 → "$49.99")
export function formatStripeCents(cents: number, currency = 'usd'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100)
}
