// Card-processing fee passthrough. Pure module — safe to import from
// client components (no `import Stripe from 'stripe'` side effect).
// Stripe Checkout receives the surcharge as a separate line item so it
// appears on the hosted checkout page and on the receipt.

export const CARD_SURCHARGE_RATE = 0.03

export interface SurchargeBreakdown {
  baseCents: number
  surchargeCents: number
  totalCents: number
}

export function applyCardSurcharge(baseCents: number): SurchargeBreakdown {
  const surchargeCents = Math.round(baseCents * CARD_SURCHARGE_RATE)
  return {
    baseCents,
    surchargeCents,
    totalCents: baseCents + surchargeCents,
  }
}
