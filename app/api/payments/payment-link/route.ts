// POST /api/payments/payment-link — Admin generates a Stripe Checkout link
// for a student so they can pay by card. No card data touches our servers —
// keeps us out of PCI scope.
//
// Two modes:
//   - mode='package' — student buys a specific package. Webhook creates a
//     purchase row + credits all lessons in full once paid.
//   - mode='balance' — student pays down their outstanding balance. Webhook
//     applies the payment to outstanding purchases (oldest first), unlocking
//     lessons proportionally, mirroring the cash/check 'balance' mode of
//     /api/payments/manual but settled by card via Stripe.
//
// The 3% card processing surcharge is always added as a separate Stripe
// line item so the student sees the breakdown on the hosted checkout page.
//
// If sendEmail=true, the link is also emailed to the student via Resend.

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { applyCardSurcharge, createStripeClient } from '@/lib/stripe'
import { decryptSecret } from '@/lib/crypto'
import { notifyPaymentLink } from '@/lib/email/send-payment-link'

const bodySchema = z
  .object({
    studentId: z.string().uuid(),
    mode: z.enum(['package', 'balance']).optional().default('package'),
    packageId: z.string().uuid().optional(),
    amountCents: z.number().int().min(50).optional(), // Stripe minimum is $0.50
    sendEmail: z.boolean().optional().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.mode === 'package' && !v.packageId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['packageId'],
        message: 'packageId required for package mode',
      })
    }
    if (v.mode === 'balance' && (v.amountCents === undefined || v.amountCents <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amountCents'],
        message: 'amountCents required for balance mode',
      })
    }
  })

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('role, school_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const adminClient = createAdminClient()

  const { data: school } = await adminClient
    .from('schools')
    .select('stripe_secret_key')
    .eq('id', profile.school_id)
    .single()

  if (!school?.stripe_secret_key) {
    return NextResponse.json(
      { error: 'Stripe is not configured for this school' },
      { status: 422 }
    )
  }

  // Verify the student belongs to this admin's school
  const { data: student } = await adminClient
    .from('students')
    .select('id, school_id')
    .eq('id', parsed.data.studentId)
    .eq('school_id', profile.school_id)
    .single()

  if (!student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 })
  }

  // Resolve what's being purchased: a package or an arbitrary balance amount.
  let baseAmountCents: number
  let lineItemName: string
  let packageId: string | null = null
  let lessonCount = 0
  let packageName: string | null = null

  if (parsed.data.mode === 'package') {
    const { data: pkg } = await adminClient
      .from('packages')
      .select('id, name, price_cents, lesson_count')
      .eq('id', parsed.data.packageId!)
      .eq('school_id', profile.school_id)
      .eq('is_active', true)
      .single()

    if (!pkg) {
      return NextResponse.json({ error: 'Package not found or inactive' }, { status: 404 })
    }

    baseAmountCents = pkg.price_cents
    lineItemName = pkg.name
    packageId = pkg.id
    lessonCount = pkg.lesson_count
    packageName = pkg.name
  } else {
    // balance mode
    baseAmountCents = parsed.data.amountCents!
    lineItemName = 'Account balance payment'
  }

  const origin = request.headers.get('origin') ?? ''
  const successUrl = `${origin}/student/packages?success=1&session_id={CHECKOUT_SESSION_ID}`
  const cancelUrl = `${origin}/student/packages?cancelled=1`

  // 3% card processing fee as a separate Stripe line item.
  const { surchargeCents, totalCents } = applyCardSurcharge(baseAmountCents)

  const stripe = createStripeClient(decryptSecret(school.stripe_secret_key)!)

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: baseAmountCents,
          product_data: { name: lineItemName },
        },
        quantity: 1,
      },
      {
        price_data: {
          currency: 'usd',
          unit_amount: surchargeCents,
          product_data: { name: 'Credit card processing fee (3%)' },
        },
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      mode: parsed.data.mode,
      student_id: student.id,
      school_id: profile.school_id,
      package_id: packageId ?? '',
      lesson_count: String(lessonCount),
      amount_cents: String(baseAmountCents),
      surcharge_cents: String(surchargeCents),
      total_cents: String(totalCents),
    },
  })

  if (!session.url) {
    return NextResponse.json({ error: 'Stripe did not return a checkout URL' }, { status: 502 })
  }

  let emailed = false
  let emailReason: string | undefined
  let emailedTo: string | undefined

  if (parsed.data.sendEmail) {
    const result = await notifyPaymentLink({
      client: adminClient,
      schoolId: profile.school_id,
      studentId: student.id,
      mode: parsed.data.mode,
      packageName,
      lessonCount,
      priceCents: baseAmountCents,
      surchargeCents,
      totalCents,
      checkoutUrl: session.url,
    })
    emailed = result.sent
    emailReason = result.reason
    emailedTo = result.to
  }

  return NextResponse.json({
    url: session.url,
    emailed,
    emailReason,
    emailedTo,
    mode: parsed.data.mode,
    priceCents: baseAmountCents,
    surchargeCents,
    totalCents,
  })
}
