'use client'

import { useEffect, useMemo, useState } from 'react'
import { CreditCard, Copy, Check, Loader2, Mail } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn, formatCurrency } from '@/lib/utils'
import { applyCardSurcharge, CARD_SURCHARGE_RATE } from '@/lib/surcharge'
import type { Package } from '@/types'

type Mode = 'package' | 'balance'

interface SendPaymentLinkDialogProps {
  studentId: string
  packages: Package[]
  currentBalanceCents?: number
}

interface GenerateResponse {
  url: string
  emailed: boolean
  emailReason?: string
  emailedTo?: string
  mode?: Mode
  priceCents?: number
  surchargeCents?: number
  totalCents?: number
}

export function SendPaymentLinkDialog({
  studentId,
  packages,
  currentBalanceCents = 0,
}: SendPaymentLinkDialogProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('package')
  const [packageId, setPackageId] = useState<string>(packages[0]?.id ?? '')
  const [balanceDollars, setBalanceDollars] = useState<string>('')
  const [sendEmail, setSendEmail] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<GenerateResponse | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (open) {
      setMode('package')
      setPackageId(packages[0]?.id ?? '')
      // Pre-fill with current outstanding balance when positive.
      setBalanceDollars(
        currentBalanceCents > 0 ? (currentBalanceCents / 100).toFixed(2) : ''
      )
      setSendEmail(false)
      setResult(null)
      setCopied(false)
    }
  }, [open, packages, currentBalanceCents])

  const noPackages = packages.length === 0
  const selectedPackage = packages.find((p) => p.id === packageId) ?? null
  const surchargePct = (CARD_SURCHARGE_RATE * 100).toFixed(0)

  const balanceCents = useMemo(() => {
    const v = parseFloat(balanceDollars)
    if (!Number.isFinite(v) || v <= 0) return 0
    return Math.round(v * 100)
  }, [balanceDollars])

  const balanceBreakdown = useMemo(
    () => (balanceCents > 0 ? applyCardSurcharge(balanceCents) : null),
    [balanceCents]
  )

  async function handleGenerate() {
    if (mode === 'package' && !packageId) {
      toast.error('Pick a package')
      return
    }
    if (mode === 'balance' && balanceCents <= 0) {
      toast.error('Enter an amount greater than $0')
      return
    }

    setSubmitting(true)

    const body: Record<string, unknown> = { studentId, mode, sendEmail }
    if (mode === 'package') body.packageId = packageId
    if (mode === 'balance') body.amountCents = balanceCents

    const res = await fetch('/api/payments/payment-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    setSubmitting(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? 'Failed to generate link')
      return
    }

    const data = (await res.json()) as GenerateResponse
    setResult(data)

    if (sendEmail) {
      if (data.emailed) {
        toast.success(`Link emailed to ${data.emailedTo ?? 'student'}`)
      } else if (data.emailReason === 'student_has_no_email') {
        toast.warning('Link generated, but the student has no email on file')
      } else if (data.emailReason === 'email_not_configured') {
        toast.warning('Link generated. Email is not configured on the server')
      } else {
        toast.warning('Link generated, but the email could not be sent')
      }
    } else {
      toast.success('Link generated')
    }
  }

  async function handleCopy() {
    if (!result?.url) return
    try {
      await navigator.clipboard.writeText(result.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy. Select the link and copy manually.')
    }
  }

  const generateDisabled =
    submitting ||
    (mode === 'package' && noPackages) ||
    (mode === 'balance' && balanceCents <= 0)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <CreditCard className="mr-2 h-3.5 w-3.5" />
          Send Payment Link
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send a payment link</DialogTitle>
          <DialogDescription>
            Generate a Stripe Checkout link the student can use to pay by card.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4 py-2">
            {/* Mode tabs */}
            <div className="flex gap-1 rounded-md border p-1">
              <ModeTab
                active={mode === 'package'}
                onClick={() => setMode('package')}
                disabled={noPackages}
                label="Package"
              />
              <ModeTab
                active={mode === 'balance'}
                onClick={() => setMode('balance')}
                label="Pay Balance"
              />
            </div>

            {/* ── Package mode ───────────────────────────────── */}
            {mode === 'package' && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="link-pkg">Package</Label>
                  {noPackages ? (
                    <p className="text-xs text-muted-foreground">
                      No active packages. Create a package first.
                    </p>
                  ) : (
                    <Select value={packageId} onValueChange={setPackageId}>
                      <SelectTrigger id="link-pkg">
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
                </div>

                {selectedPackage && (() => {
                  const breakdown = applyCardSurcharge(selectedPackage.price_cents)
                  return (
                    <BreakdownCard
                      label="Package"
                      lessonCount={selectedPackage.lesson_count}
                      baseCents={breakdown.baseCents}
                      surchargeCents={breakdown.surchargeCents}
                      totalCents={breakdown.totalCents}
                      surchargePct={surchargePct}
                    />
                  )
                })()}
              </>
            )}

            {/* ── Balance mode ───────────────────────────────── */}
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
                  <Label htmlFor="bal-amount">Amount to charge ($)</Label>
                  <Input
                    id="bal-amount"
                    type="number"
                    step="0.01"
                    min={0.5}
                    placeholder="e.g. 150.00"
                    value={balanceDollars}
                    onChange={(e) => setBalanceDollars(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Defaults to the current outstanding balance. You can charge
                    any amount — overpayments become a credit on the account.
                  </p>
                </div>

                {balanceBreakdown && (
                  <BreakdownCard
                    label="Balance payment"
                    baseCents={balanceBreakdown.baseCents}
                    surchargeCents={balanceBreakdown.surchargeCents}
                    totalCents={balanceBreakdown.totalCents}
                    surchargePct={surchargePct}
                  />
                )}
              </>
            )}

            <label className="flex items-start gap-3 text-sm cursor-pointer">
              <Switch
                checked={sendEmail}
                onCheckedChange={setSendEmail}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">Also email this link to the student</span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  You&apos;ll get the URL back to share by SMS or other channels too.
                </span>
              </span>
            </label>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={generateDisabled} onClick={handleGenerate}>
                {submitting && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                Generate link
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Payment link</Label>
              <div className="flex gap-2">
                <Input value={result.url} readOnly className="font-mono text-xs" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  aria-label="Copy link"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-primary" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {result.totalCents !== undefined && result.surchargeCents !== undefined && (
                <p className="text-xs text-muted-foreground">
                  Student will be charged{' '}
                  <span className="font-medium text-foreground">
                    {formatCurrency(result.totalCents)}
                  </span>{' '}
                  (includes {surchargePct}% card processing fee of{' '}
                  {formatCurrency(result.surchargeCents)}).
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Share via SMS, WhatsApp, or any channel. The link expires in 24 hours.
              </p>
            </div>

            {result.emailed && result.emailedTo && (
              <div className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs text-foreground flex items-start gap-2">
                <Mail className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <span>
                  Emailed to{' '}
                  <span className="font-medium">{result.emailedTo}</span>.
                </span>
              </div>
            )}

            {sendEmail && !result.emailed && (
              <div className="rounded-md border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {result.emailReason === 'student_has_no_email'
                  ? 'The student has no email on file. Share the link manually.'
                  : result.emailReason === 'email_not_configured'
                  ? 'Email is not configured on the server. Share the link manually.'
                  : 'The email could not be sent. Share the link manually.'}
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button type="button" onClick={() => setOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
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

function BreakdownCard({
  label,
  lessonCount,
  baseCents,
  surchargeCents,
  totalCents,
  surchargePct,
}: {
  label: string
  lessonCount?: number
  baseCents: number
  surchargeCents: number
  totalCents: number
  surchargePct: string
}) {
  return (
    <div className="rounded-md bg-muted/40 border px-3 py-2 text-xs text-muted-foreground space-y-1">
      <div className="flex justify-between">
        <span>
          {label}
          {lessonCount !== undefined && ` (${lessonCount} lessons)`}
        </span>
        <span className="text-foreground">{formatCurrency(baseCents)}</span>
      </div>
      <div className="flex justify-between">
        <span>Card processing fee ({surchargePct}%)</span>
        <span className="text-foreground">{formatCurrency(surchargeCents)}</span>
      </div>
      <div className="flex justify-between border-t pt-1 mt-1">
        <span className="font-medium text-foreground">Student pays</span>
        <span className="font-bold text-foreground">{formatCurrency(totalCents)}</span>
      </div>
      <p className="pt-1 text-[11px] leading-relaxed">
        A {surchargePct}% card processing fee will be added on top and is shown to the
        student on Stripe&apos;s checkout page. Link expires in 24 hours.
      </p>
    </div>
  )
}
