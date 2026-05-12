'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Wallet } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn, formatCurrency } from '@/lib/utils'
import type { AgeGroup, Package } from '@/types'

type Mode = 'package' | 'custom' | 'balance'
type PaymentStatus = 'paid_full' | 'partial' | 'unpaid'
type PaymentMethod = 'cash' | 'check' | 'other'

const formSchema = z
  .object({
    mode: z.enum(['package', 'custom', 'balance']),
    packageId: z.string().optional(),
    paymentStatus: z.enum(['paid_full', 'partial', 'unpaid']).optional(),
    lessonCount: z.string().optional(),
    amountPaidDollars: z.string().optional(),
    discountDollars: z.string().optional(),
    paymentMethod: z.enum(['cash', 'check', 'other']),
    description: z.string().max(200).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.mode === 'package') {
      if (!v.packageId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['packageId'],
          message: 'Pick a package',
        })
      }
      if (v.paymentStatus === 'partial') {
        const amt = parseFloat(v.amountPaidDollars ?? '')
        if (!Number.isFinite(amt) || amt <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['amountPaidDollars'],
            message: 'Enter the amount paid',
          })
        }
      }
      const disc = parseFloat(v.discountDollars ?? '')
      if (v.discountDollars && (!Number.isFinite(disc) || disc < 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['discountDollars'],
          message: 'Discount must be 0 or more',
        })
      }
    }
    if (v.mode === 'custom') {
      const lc = parseInt(v.lessonCount ?? '', 10)
      const amt = parseFloat(v.amountPaidDollars ?? '')
      if (!Number.isFinite(lc) || lc < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lessonCount'],
          message: 'Enter at least 1 lesson',
        })
      }
      if (!Number.isFinite(amt) || amt < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['amountPaidDollars'],
          message: 'Enter a valid amount',
        })
      }
    }
    if (v.mode === 'balance') {
      const amt = parseFloat(v.amountPaidDollars ?? '')
      if (!Number.isFinite(amt) || amt <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['amountPaidDollars'],
          message: 'Enter an amount',
        })
      }
    }
  })

type FormValues = z.infer<typeof formSchema>

interface RecordPaymentDialogProps {
  studentId: string
  studentAgeGroup: AgeGroup
  packages: Package[]
  currentBalanceCents?: number
}

export function RecordPaymentDialog({
  studentId,
  studentAgeGroup,
  packages,
  currentBalanceCents = 0,
}: RecordPaymentDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // Cached form values awaiting confirmation when the package program
  // doesn't match the student's age_group. Null = no pending confirm.
  const [pendingValues, setPendingValues] = useState<FormValues | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      mode: 'package',
      packageId: packages[0]?.id ?? '',
      paymentStatus: 'paid_full',
      lessonCount: '',
      amountPaidDollars: '',
      discountDollars: '',
      paymentMethod: 'cash',
      description: '',
    },
  })

  const mode = form.watch('mode') as Mode
  const paymentStatus = form.watch('paymentStatus') as PaymentStatus | undefined
  const packageId = form.watch('packageId')
  const amountPaidDollarsStr = form.watch('amountPaidDollars') ?? ''
  const discountDollarsStr = form.watch('discountDollars') ?? ''

  const selectedPackage = useMemo(
    () => packages.find((p) => p.id === packageId) ?? null,
    [packages, packageId]
  )

  useEffect(() => {
    if (open) {
      form.reset({
        mode: 'package',
        packageId: packages[0]?.id ?? '',
        paymentStatus: 'paid_full',
        lessonCount: '',
        amountPaidDollars: '',
        discountDollars: '',
        paymentMethod: 'cash',
        description: '',
      })
    }
  }, [open, packages, form])

  // Live preview of how the package will affect lessons + balance.
  // Effective price = price - discount. Lessons activate proportionally:
  //   activated = floor(paid * total / effective_price)
  const packageSummary = useMemo(() => {
    if (mode !== 'package' || !selectedPackage) return null
    const price = selectedPackage.price_cents
    const total = selectedPackage.lesson_count
    const discRaw = parseFloat(discountDollarsStr)
    const discount = Number.isFinite(discRaw) && discRaw > 0
      ? Math.min(Math.round(discRaw * 100), price)
      : 0
    const effective = price - discount
    let paid = 0
    if (paymentStatus === 'paid_full') paid = effective
    else if (paymentStatus === 'partial') {
      const parsed = parseFloat(amountPaidDollarsStr)
      paid = Number.isFinite(parsed) ? Math.min(Math.round(parsed * 100), effective) : 0
    } else paid = 0
    const owed = Math.max(0, effective - paid)
    const activated =
      effective <= 0
        ? total
        : paid <= 0
        ? 0
        : paid >= effective
        ? total
        : Math.floor((paid * total) / effective)
    const locked = total - activated
    return { price, discount, effective, paid, owed, total, activated, locked }
  }, [mode, selectedPackage, paymentStatus, amountPaidDollarsStr, discountDollarsStr])

  // True when the chosen package's program_type conflicts with this student.
  // Package mode only — custom/balance never have a package picker.
  const programMismatch = useMemo(() => {
    if (mode !== 'package' || !selectedPackage) return false
    const pt = selectedPackage.program_type
    if (pt === 'both') return false
    return pt !== studentAgeGroup
  }, [mode, selectedPackage, studentAgeGroup])

  function onSubmit(values: FormValues) {
    if (values.mode === 'package' && programMismatch) {
      setPendingValues(values)
      return
    }
    return submitToApi(values)
  }

  async function submitToApi(values: FormValues) {
    setSubmitting(true)

    const body: Record<string, unknown> = {
      studentId,
      mode: values.mode,
      paymentMethod: values.paymentMethod,
      description: values.description?.trim() || null,
    }

    if (values.mode === 'package') {
      body.packageId = values.packageId
      body.paymentStatus = values.paymentStatus
      if (values.paymentStatus === 'partial') {
        body.amountPaidCents = Math.round(
          parseFloat(values.amountPaidDollars ?? '') * 100
        )
      }
      const disc = parseFloat(values.discountDollars ?? '')
      if (Number.isFinite(disc) && disc > 0) {
        body.discountCents = Math.round(disc * 100)
      }
    } else if (values.mode === 'custom') {
      body.lessonCount = parseInt(values.lessonCount ?? '', 10)
      body.amountPaidCents = Math.round(
        parseFloat(values.amountPaidDollars ?? '') * 100
      )
    } else {
      // balance payment
      body.amountPaidCents = Math.round(
        parseFloat(values.amountPaidDollars ?? '') * 100
      )
    }

    const res = await fetch('/api/payments/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    setSubmitting(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? 'Failed to record payment')
      return
    }

    toast.success('Recorded')
    setOpen(false)
    router.refresh()
  }

  const noPackages = packages.length === 0
  const showPaymentMethod =
    mode !== 'package' ||
    paymentStatus === 'paid_full' ||
    paymentStatus === 'partial'

  return (
    <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <Wallet className="mr-2 h-3.5 w-3.5" />
          Record Payment
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record a Payment</DialogTitle>
          <DialogDescription>
            Assign a package, log a custom payment, or pay down the student&apos;s
            outstanding balance.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
          {/* Mode tabs */}
          <div className="flex gap-1 rounded-md border p-1">
            <ModeTab
              active={mode === 'package'}
              onClick={() => form.setValue('mode', 'package')}
              disabled={noPackages}
              label="Package"
            />
            <ModeTab
              active={mode === 'custom'}
              onClick={() => form.setValue('mode', 'custom')}
              label="Custom"
            />
            <ModeTab
              active={mode === 'balance'}
              onClick={() => form.setValue('mode', 'balance')}
              label="Pay Balance"
            />
          </div>

          {/* ── Package mode ─────────────────────────────────── */}
          {mode === 'package' && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="pkg-select">Package</Label>
                {noPackages ? (
                  <p className="text-xs text-muted-foreground">
                    No active packages. Switch to Custom or create a package first.
                  </p>
                ) : (
                  <Select
                    value={form.watch('packageId') ?? ''}
                    onValueChange={(v) => form.setValue('packageId', v)}
                  >
                    <SelectTrigger id="pkg-select">
                      <SelectValue placeholder="Select a package" />
                    </SelectTrigger>
                    <SelectContent>
                      {packages.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} — {p.lesson_count} lessons ·{' '}
                          {formatCurrency(p.price_cents)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {form.formState.errors.packageId && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.packageId.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Payment status</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  <PaymentStatusPill
                    active={paymentStatus === 'paid_full'}
                    onClick={() => form.setValue('paymentStatus', 'paid_full')}
                    label="Paid in full"
                  />
                  <PaymentStatusPill
                    active={paymentStatus === 'partial'}
                    onClick={() => form.setValue('paymentStatus', 'partial')}
                    label="Partial"
                  />
                  <PaymentStatusPill
                    active={paymentStatus === 'unpaid'}
                    onClick={() => form.setValue('paymentStatus', 'unpaid')}
                    label="Unpaid"
                  />
                </div>
              </div>

              {paymentStatus === 'partial' && (
                <div className="space-y-1.5">
                  <Label htmlFor="partial-amount">Amount paid now ($)</Label>
                  <Input
                    id="partial-amount"
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder="e.g. 100.00"
                    {...form.register('amountPaidDollars')}
                  />
                  {form.formState.errors.amountPaidDollars && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.amountPaidDollars.message}
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="pkg-discount">
                  Discount ($){' '}
                  <span className="text-xs text-muted-foreground font-normal">
                    (optional)
                  </span>
                </Label>
                <Input
                  id="pkg-discount"
                  type="number"
                  step="0.01"
                  min={0}
                  placeholder="e.g. 25.00"
                  {...form.register('discountDollars')}
                />
                {form.formState.errors.discountDollars && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.discountDollars.message}
                  </p>
                )}
              </div>

              {programMismatch && selectedPackage && (
                <div className="rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <span className="font-medium">Heads up:</span> this package is
                  marked{' '}
                  <span className="font-medium">
                    {selectedPackage.program_type === 'teen' ? 'Teen only' : 'Adult only'}
                  </span>
                  , but this student is{' '}
                  <span className="font-medium">
                    {studentAgeGroup === 'teen' ? 'Teen' : 'Adult'}
                  </span>
                  . You&apos;ll be asked to confirm.
                </div>
              )}

              {packageSummary && selectedPackage && (
                <div className="rounded-md bg-muted/40 border px-3 py-2 text-xs text-muted-foreground space-y-1">
                  {packageSummary.discount > 0 && (
                    <div>
                      Discount{' '}
                      <span className="font-medium text-foreground">
                        −{formatCurrency(packageSummary.discount)}
                      </span>{' '}
                      → effective price{' '}
                      <span className="font-medium text-foreground">
                        {formatCurrency(packageSummary.effective)}
                      </span>
                      .
                    </div>
                  )}
                  <div>
                    Will activate{' '}
                    <span className="font-medium text-foreground">
                      {packageSummary.activated}/{packageSummary.total} lessons
                    </span>
                    {packageSummary.locked > 0 && (
                      <span>
                        {' '}
                        (
                        <span className="text-amber-600 font-medium">
                          {packageSummary.locked} locked
                        </span>{' '}
                        until the balance is paid)
                      </span>
                    )}
                    .
                  </div>
                  {packageSummary.owed > 0 && (
                    <div>
                      Pending balance will increase by{' '}
                      <span className="font-medium text-destructive">
                        {formatCurrency(packageSummary.owed)}
                      </span>
                      .
                    </div>
                  )}
                  {packageSummary.paid > 0 && (
                    <div>
                      Recording{' '}
                      <span className="font-medium text-foreground">
                        {formatCurrency(packageSummary.paid)}
                      </span>{' '}
                      payment.
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── Custom mode ──────────────────────────────────── */}
          {mode === 'custom' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="custom-lessons">Lessons</Label>
                <Input
                  id="custom-lessons"
                  type="number"
                  min={1}
                  placeholder="e.g. 5"
                  {...form.register('lessonCount')}
                />
                {form.formState.errors.lessonCount && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.lessonCount.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="custom-amount">Amount ($)</Label>
                <Input
                  id="custom-amount"
                  type="number"
                  step="0.01"
                  min={0}
                  placeholder="e.g. 250.00"
                  {...form.register('amountPaidDollars')}
                />
                {form.formState.errors.amountPaidDollars && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.amountPaidDollars.message}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Balance payment mode ─────────────────────────── */}
          {mode === 'balance' && (
            <>
              <div
                className={cn(
                  'rounded-md border px-3 py-2 text-xs',
                  currentBalanceCents > 0
                    ? 'border-destructive/40 bg-destructive/5'
                    : 'bg-muted/40'
                )}
              >
                {currentBalanceCents > 0
                  ? `Student currently owes ${formatCurrency(currentBalanceCents)}.`
                  : currentBalanceCents < 0
                  ? `Student has a credit of ${formatCurrency(-currentBalanceCents)}.`
                  : 'Student has no outstanding balance.'}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bal-amount">Amount paid ($)</Label>
                <Input
                  id="bal-amount"
                  type="number"
                  step="0.01"
                  min={0}
                  placeholder="e.g. 150.00"
                  {...form.register('amountPaidDollars')}
                />
                {form.formState.errors.amountPaidDollars && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.amountPaidDollars.message}
                  </p>
                )}
              </div>
            </>
          )}

          {/* Common: concept + payment method */}
          <div className="space-y-1.5">
            <Label htmlFor="pmt-description">
              Concept{' '}
              <span className="text-xs text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Input
              id="pmt-description"
              placeholder="e.g. Pago parcial paquete 10h"
              maxLength={200}
              {...form.register('description')}
            />
          </div>

          {showPaymentMethod && (
            <div className="space-y-1.5">
              <Label htmlFor="pmt-method">Payment method</Label>
              <Select
                value={form.watch('paymentMethod')}
                onValueChange={(v) =>
                  form.setValue('paymentMethod', v as PaymentMethod)
                }
              >
                <SelectTrigger id="pmt-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Record
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    {/* Soft confirm when admin assigns a mismatched program (teen↔adult) */}
    <AlertDialog
      open={!!pendingValues}
      onOpenChange={(o) => {
        if (!o) setPendingValues(null)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mismatched program</AlertDialogTitle>
          <AlertDialogDescription>
            This package is for{' '}
            <span className="font-medium">
              {selectedPackage?.program_type === 'teen' ? 'teens' : 'adults'}
            </span>{' '}
            but the student is{' '}
            <span className="font-medium">
              {studentAgeGroup === 'teen' ? 'a teen' : 'an adult'}
            </span>
            . Are you sure you want to assign it?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setPendingValues(null)}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              const v = pendingValues
              setPendingValues(null)
              if (v) submitToApi(v)
            }}
          >
            Yes, assign anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}

function ModeTab({
  active,
  onClick,
  disabled,
  label,
}: {
  active: boolean
  onClick: () => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex-1 rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'bg-background shadow-sm text-foreground'
          : 'text-muted-foreground hover:text-foreground',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      {label}
    </button>
  )
}

function PaymentStatusPill({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-input text-muted-foreground hover:text-foreground'
      )}
    >
      {label}
    </button>
  )
}
