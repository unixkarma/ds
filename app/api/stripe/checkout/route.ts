// POST /api/stripe/checkout — create a Stripe Checkout Session using the school's own Stripe key.
// Supports purchasing a package or a single lesson.
// After payment, Stripe redirects to /student/packages?success=1

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { applyCardSurcharge, createStripeClient } from '@/lib/stripe'
import { decryptSecret } from '@/lib/crypto'

const bodySchema = z.object({
  // Either a package_id OR 'single_lesson'
  package_id: z.string(),
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

  if (!profile || (profile.role !== 'student' && profile.role !== 'parent')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Fetch school (need Stripe keys + single_lesson_price)
  const { data: school } = await adminClient
    .from('schools')
    .select('stripe_secret_key, stripe_publishable_key, single_lesson_price_cents')
    .eq('id', profile.school_id)
    .single()

  if (!school?.stripe_secret_key) {
    return NextResponse.json(
      { error: 'Stripe is not configured for this school' },
      { status: 422 }
    )
  }

  // Fetch the student row
  const { data: student } = await adminClient
    .from('students')
    .select('id')
    .eq('user_id', user.id)
    .eq('school_id', profile.school_id)
    .single()

  if (!student) {
    return NextResponse.json({ error: 'Student record not found' }, { status: 404 })
  }

  // Resolve what's being purchased
  let productName: string
  let amountCents: number
  let lessonCount: number
  let packageId: string | null = null

  if (parsed.data.package_id === 'single_lesson') {
    if (!school.single_lesson_price_cents || school.single_lesson_price_cents <= 0) {
      return NextResponse.json({ error: 'Single lesson purchases are not enabled' }, { status: 422 })
    }
    productName = 'Single Driving Lesson'
    amountCents = school.single_lesson_price_cents
    lessonCount = 1
    packageId = null
  } else {
    const { data: pkg } = await adminClient
      .from('packages')
      .select('*')
      .eq('id', parsed.data.package_id)
      .eq('school_id', profile.school_id)
      .eq('is_active', true)
      .single()

    if (!pkg) {
      return NextResponse.json({ error: 'Package not found or inactive' }, { status: 404 })
    }

    productName = pkg.name
    amountCents = pkg.price_cents
    lessonCount = pkg.lesson_count
    packageId = pkg.id
  }

  // Build success/cancel URLs
  const origin = request.headers.get('origin') ?? ''
  const successUrl = `${origin}/student/packages?success=1&session_id={CHECKOUT_SESSION_ID}`
  const cancelUrl = `${origin}/student/packages?cancelled=1`

  // Pass the 3% card processing fee through to the student as a separate
  // line item — Stripe's hosted checkout will show the breakdown clearly.
  // metadata.amount_cents keeps the BASE package price so the purchase row
  // is recorded at list price; the surcharge is implicit in the gross.
  const { surchargeCents, totalCents } = applyCardSurcharge(amountCents)

  const stripe = createStripeClient(decryptSecret(school.stripe_secret_key)!)

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: amountCents,
          product_data: { name: productName },
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
      student_id: student.id,
      school_id: profile.school_id,
      package_id: packageId ?? '',
      lesson_count: String(lessonCount),
      amount_cents: String(amountCents),
      surcharge_cents: String(surchargeCents),
      total_cents: String(totalCents),
    },
  })

  return NextResponse.json({ url: session.url })
}
