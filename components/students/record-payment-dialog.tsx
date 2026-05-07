'use client'

import { useEffect, useState } from 'react'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils'
import type { Package } from '@/types'

const formSchema = z
  .object({
    mode: z.enum(['package', 'custom']),
    packageId: z.string().optional(),
    lessonCount: z.string().optional(),
    amountDollars: z.string().optional(),
    paymentMethod: z.enum(['cash', 'check', 'other']),
  })
  .superRefine((v, ctx) => {
    if (v.mode === 'package' && !v.packageId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['packageId'],
        message: 'Pick a package',
      })
    }
    if (v.mode === 'custom') {
      const lc = parseInt(v.lessonCount ?? '', 10)
      const amt = parseFloat(v.amountDollars ?? '')
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
          path: ['amountDollars'],
          message: 'Enter a valid amount',
        })
      }
    }
  })

type FormValues = z.infer<typeof formSchema>

interface RecordPaymentDialogProps {
  studentId: string
  packages: Package[]
}

export function RecordPaymentDialog({ studentId, packages }: RecordPaymentDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      mode: 'package',
      packageId: packages[0]?.id ?? '',
      lessonCount: '',
      amountDollars: '',
      paymentMethod: 'cash',
    },
  })

  const mode = form.watch('mode')
  const packageId = form.watch('packageId')
  const selectedPackage = packages.find((p) => p.id === packageId) ?? null

  useEffect(() => {
    if (open) {
      form.reset({
        mode: 'package',
        packageId: packages[0]?.id ?? '',
        lessonCount: '',
        amountDollars: '',
        paymentMethod: 'cash',
      })
    }
  }, [open, packages, form])

  async function onSubmit(values: FormValues) {
    setSubmitting(true)

    const body: Record<string, unknown> = {
      studentId,
      paymentMethod: values.paymentMethod,
    }

    if (values.mode === 'package') {
      body.packageId = values.packageId
    } else {
      body.lessonCount = parseInt(values.lessonCount ?? '', 10)
      body.amountCents = Math.round(parseFloat(values.amountDollars ?? '') * 100)
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

    toast.success('Payment recorded')
    setOpen(false)
    router.refresh()
  }

  const noPackages = packages.length === 0

  return (
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
            Log a cash, check, or other offline payment and credit lessons to the student.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={mode === 'package' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => form.setValue('mode', 'package')}
              disabled={noPackages}
            >
              Use Package
            </Button>
            <Button
              type="button"
              variant={mode === 'custom' ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              onClick={() => form.setValue('mode', 'custom')}
            >
              Custom
            </Button>
          </div>

          {mode === 'package' ? (
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
                        {p.name} — {p.lesson_count} lessons · {formatCurrency(p.price_cents)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedPackage && (
                <p className="text-xs text-muted-foreground">
                  Will credit {selectedPackage.lesson_count} lesson
                  {selectedPackage.lesson_count !== 1 && 's'} for{' '}
                  {formatCurrency(selectedPackage.price_cents)}.
                </p>
              )}
              {form.formState.errors.packageId && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.packageId.message}
                </p>
              )}
            </div>
          ) : (
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
                  {...form.register('amountDollars')}
                />
                {form.formState.errors.amountDollars && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.amountDollars.message}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="pmt-method">Payment method</Label>
            <Select
              value={form.watch('paymentMethod')}
              onValueChange={(v) =>
                form.setValue('paymentMethod', v as FormValues['paymentMethod'])
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
  )
}
