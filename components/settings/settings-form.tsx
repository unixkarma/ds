'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Building2, CreditCard, Eye, EyeOff, CheckCircle2, Link2, Copy, Check, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { School } from '@/types'

// ── Schemas ───────────────────────────────────────────────────

const schoolSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email required'),
  phone: z.string(),
  address: z.string(),
})

const stripeSchema = z.object({
  stripe_publishable_key: z.string(),
  stripe_secret_key: z.string(),
  stripe_webhook_secret: z.string(),
  single_lesson_price_cents: z.string(),
})

type SchoolValues = z.infer<typeof schoolSchema>
type StripeValues = z.infer<typeof stripeSchema>

interface SettingsFormProps {
  school: School
}

// ── School info tab ───────────────────────────────────────────

function SchoolInfoForm({ school }: { school: School }) {
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<SchoolValues>({
    resolver: zodResolver(schoolSchema),
    defaultValues: {
      name: school.name,
      email: school.email,
      phone: school.phone,
      address: school.address,
    },
  })

  async function onSubmit(values: SchoolValues) {
    setError(null)
    setSuccess(false)

    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Failed to save settings')
      return
    }

    setSuccess(true)
    setTimeout(() => setSuccess(false), 3000)
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      {success && (
        <Alert className="border-emerald-500 bg-emerald-50 text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>School information saved successfully.</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">School Name</Label>
          <Input id="name" {...form.register('name')} />
          {form.formState.errors.name && (
            <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" {...form.register('email')} />
          {form.formState.errors.email && (
            <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" {...form.register('phone')} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="address">Address</Label>
          <Input id="address" {...form.register('address')} />
        </div>
      </div>

      <div className="pt-2">
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>
    </form>
  )
}

// ── Stripe integration tab ────────────────────────────────────

function StripeForm({ school }: { school: School }) {
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSecret, setShowSecret] = useState(false)
  const [showWebhook, setShowWebhook] = useState(false)

  const form = useForm<StripeValues>({
    resolver: zodResolver(stripeSchema),
    defaultValues: {
      stripe_publishable_key: school.stripe_publishable_key ?? '',
      stripe_secret_key: school.stripe_secret_key ? '••••••••••••••••' : '',
      stripe_webhook_secret: school.stripe_webhook_secret ? '••••••••••••••••' : '',
      single_lesson_price_cents: school.single_lesson_price_cents
        ? String(school.single_lesson_price_cents)
        : '0',
    },
  })

  async function onSubmit(values: StripeValues) {
    setError(null)
    setSuccess(false)

    // Skip masked placeholder values (user didn't change them)
    const payload: Record<string, unknown> = {
      stripe_publishable_key: values.stripe_publishable_key || null,
      single_lesson_price_cents: parseInt(values.single_lesson_price_cents, 10) || 0,
    }
    if (!values.stripe_secret_key.startsWith('••')) {
      payload.stripe_secret_key = values.stripe_secret_key || null
    }
    if (!values.stripe_webhook_secret.startsWith('••')) {
      payload.stripe_webhook_secret = values.stripe_webhook_secret || null
    }

    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Failed to save settings')
      return
    }

    setSuccess(true)
    setTimeout(() => setSuccess(false), 3000)
  }

  const isConnected = !!(school.stripe_publishable_key && school.stripe_secret_key)

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      {isConnected && (
        <Alert className="border-emerald-500 bg-emerald-50 text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>Stripe is connected. Payments are enabled.</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert className="border-emerald-500 bg-emerald-50 text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>Stripe settings saved successfully.</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="stripe_publishable_key">Publishable Key</Label>
          <Input
            id="stripe_publishable_key"
            placeholder="pk_live_..."
            {...form.register('stripe_publishable_key')}
          />
          <p className="text-xs text-muted-foreground">
            Safe to use on the frontend. Starts with <code>pk_live_</code> or <code>pk_test_</code>.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="stripe_secret_key">Secret Key</Label>
          <div className="relative">
            <Input
              id="stripe_secret_key"
              type={showSecret ? 'text' : 'password'}
              placeholder="sk_live_..."
              {...form.register('stripe_secret_key')}
            />
            <button
              type="button"
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
              onClick={() => setShowSecret(v => !v)}
            >
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Never shared publicly. Stored securely server-side only.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="stripe_webhook_secret">Webhook Secret</Label>
          <div className="relative">
            <Input
              id="stripe_webhook_secret"
              type={showWebhook ? 'text' : 'password'}
              placeholder="whsec_..."
              {...form.register('stripe_webhook_secret')}
            />
            <button
              type="button"
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
              onClick={() => setShowWebhook(v => !v)}
            >
              {showWebhook ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Set this in your Stripe dashboard → Webhooks → your endpoint. Endpoint URL:{' '}
            <code className="bg-muted px-1 rounded text-xs">
              {typeof window !== 'undefined' ? window.location.origin : ''}/api/stripe/webhook
            </code>
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="single_lesson_price_cents">Single Lesson Price (cents)</Label>
          <div className="flex items-center gap-2">
            <Input
              id="single_lesson_price_cents"
              placeholder="5000"
              className="max-w-[160px]"
              {...form.register('single_lesson_price_cents')}
            />
            <span className="text-sm text-muted-foreground">
              {form.watch('single_lesson_price_cents')
                ? `= $${(parseInt(form.watch('single_lesson_price_cents'), 10) / 100).toFixed(2)}`
                : ''}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Enter 0 to disable single lesson purchases.
          </p>
        </div>
      </div>

      <div className="pt-2">
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Saving…' : 'Save Stripe Settings'}
        </Button>
      </div>
    </form>
  )
}

// ── Student registration link tab ─────────────────────────────

function RegistrationLinkPanel({ school }: { school: School }) {
  const [copied, setCopied] = useState(false)

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const registrationUrl = `${baseUrl}/register/student?school=${school.registration_code}`

  function handleCopy() {
    navigator.clipboard.writeText(registrationUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Share this link with prospective students so they can create their own accounts and register at your school.
      </p>

      <div className="flex items-center gap-2">
        <Input
          readOnly
          value={registrationUrl}
          className="font-mono text-sm"
          onClick={(e) => (e.target as HTMLInputElement).select()}
        />
        <Button type="button" variant="outline" size="icon" onClick={handleCopy}>
          {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <p>Registration Code: <code className="bg-muted px-1 rounded">{school.registration_code}</code></p>
        <p>Students who sign up through this link will automatically be added to your school.</p>
      </div>
    </div>
  )
}

// ── Policies tab (cancellation fees + booking limit) ─────────

const policiesSchema = z.object({
  student_cancellation_fee_cents: z.string(),
  instructor_cancellation_fee_cents: z.string(),
  max_booking_days_ahead: z.string(),
})

type PoliciesValues = z.infer<typeof policiesSchema>

function PoliciesForm({ school }: { school: School }) {
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm<PoliciesValues>({
    resolver: zodResolver(policiesSchema),
    defaultValues: {
      student_cancellation_fee_cents: String(school.student_cancellation_fee_cents / 100),
      instructor_cancellation_fee_cents: String(school.instructor_cancellation_fee_cents / 100),
      max_booking_days_ahead: String(school.max_booking_days_ahead),
    },
  })

  async function onSubmit(values: PoliciesValues) {
    setError(null)
    setSuccess(false)

    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_cancellation_fee_cents: Math.round(parseFloat(values.student_cancellation_fee_cents) * 100) || 0,
        instructor_cancellation_fee_cents: Math.round(parseFloat(values.instructor_cancellation_fee_cents) * 100) || 0,
        max_booking_days_ahead: parseInt(values.max_booking_days_ahead, 10) || 30,
      }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Failed to save settings')
      return
    }

    setSuccess(true)
    setTimeout(() => setSuccess(false), 3000)
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      {success && (
        <Alert className="border-emerald-500 bg-emerald-50 text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>Policy settings saved successfully.</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        <h4 className="text-sm font-medium">Cancellation Fees</h4>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="student_cancel_fee">Student Cancellation Fee ($)</Label>
            <Input
              id="student_cancel_fee"
              type="number"
              step="0.01"
              min="0"
              {...form.register('student_cancellation_fee_cents')}
            />
            <p className="text-xs text-muted-foreground">
              Charged when a student cancels a lesson.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="instructor_cancel_fee">Instructor Cancellation Fee ($)</Label>
            <Input
              id="instructor_cancel_fee"
              type="number"
              step="0.01"
              min="0"
              {...form.register('instructor_cancellation_fee_cents')}
            />
            <p className="text-xs text-muted-foreground">
              Deducted from instructor earnings when they cancel.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <h4 className="text-sm font-medium">Scheduling</h4>
        <div className="max-w-[200px]">
          <Label htmlFor="max_booking_days">Max Booking Days Ahead</Label>
          <Input
            id="max_booking_days"
            type="number"
            min="1"
            max="365"
            {...form.register('max_booking_days_ahead')}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Students and instructors can only book up to this many days in advance.
          </p>
        </div>
      </div>

      <div className="pt-2">
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Saving...' : 'Save Policy Settings'}
        </Button>
      </div>
    </form>
  )
}

// ── Main settings form ────────────────────────────────────────

export function SettingsForm({ school }: SettingsFormProps) {
  return (
    <Tabs defaultValue="school" className="space-y-4">
      <TabsList>
        <TabsTrigger value="school" className="flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5" />
          School Info
        </TabsTrigger>
        <TabsTrigger value="stripe" className="flex items-center gap-1.5">
          <CreditCard className="h-3.5 w-3.5" />
          Stripe
        </TabsTrigger>
        <TabsTrigger value="policies" className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" />
          Policies
        </TabsTrigger>
        <TabsTrigger value="registration" className="flex items-center gap-1.5">
          <Link2 className="h-3.5 w-3.5" />
          Registration
        </TabsTrigger>
      </TabsList>

      <TabsContent value="school">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">School Information</CardTitle>
            <CardDescription>
              Basic details displayed throughout the platform
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SchoolInfoForm school={school} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="stripe">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stripe Integration</CardTitle>
            <CardDescription>
              Connect your Stripe account to accept payments from students
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StripeForm school={school} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="policies">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Policies</CardTitle>
            <CardDescription>
              Cancellation fees and scheduling restrictions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PoliciesForm school={school} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="registration">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Student Registration Link</CardTitle>
            <CardDescription>
              Share this link so students can self-register at your school
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RegistrationLinkPanel school={school} />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
