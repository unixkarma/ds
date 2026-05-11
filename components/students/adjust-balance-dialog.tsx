'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Scale } from 'lucide-react'
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
import { cn, formatCurrency } from '@/lib/utils'

type AdjustmentType = 'charge' | 'credit'

const formSchema = z.object({
  type: z.enum(['charge', 'credit']),
  amountDollars: z
    .string()
    .refine((v) => Number.isFinite(parseFloat(v)) && parseFloat(v) > 0, {
      message: 'Enter an amount greater than 0',
    }),
  description: z.string().min(1, 'Reason required').max(200),
})

type FormValues = z.infer<typeof formSchema>

interface AdjustBalanceDialogProps {
  studentId: string
  currentBalanceCents: number
}

export function AdjustBalanceDialog({
  studentId,
  currentBalanceCents,
}: AdjustBalanceDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: 'charge',
      amountDollars: '',
      description: '',
    },
  })

  const type = form.watch('type') as AdjustmentType

  useEffect(() => {
    if (open) {
      form.reset({ type: 'charge', amountDollars: '', description: '' })
    }
  }, [open, form])

  async function onSubmit(values: FormValues) {
    setSubmitting(true)

    const res = await fetch(`/api/students/${studentId}/ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: values.type,
        amountCents: Math.round(parseFloat(values.amountDollars) * 100),
        description: values.description.trim(),
      }),
    })

    setSubmitting(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? 'Failed to adjust balance')
      return
    }

    toast.success('Balance adjusted')
    setOpen(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <Scale className="mr-2 h-3.5 w-3.5" />
          Adjust Balance
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust Balance</DialogTitle>
          <DialogDescription>
            Add a charge or credit to the student&apos;s balance with no money
            movement. For payments received, use Record Payment instead.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div
            className={cn(
              'rounded-md border px-3 py-2 text-xs',
              currentBalanceCents > 0
                ? 'border-destructive/40 bg-destructive/5'
                : 'bg-muted/40'
            )}
          >
            Current balance:{' '}
            <span className="font-medium">
              {currentBalanceCents > 0
                ? `${formatCurrency(currentBalanceCents)} owed`
                : currentBalanceCents < 0
                ? `${formatCurrency(-currentBalanceCents)} credit`
                : '$0.00'}
            </span>
          </div>

          <div className="space-y-1.5">
            <Label>Type</Label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => form.setValue('type', 'charge')}
                className={cn(
                  'rounded-md border px-2 py-2 text-xs font-medium transition-colors',
                  type === 'charge'
                    ? 'border-destructive bg-destructive/10 text-destructive'
                    : 'border-input text-muted-foreground hover:text-foreground'
                )}
              >
                Charge (add debt)
              </button>
              <button
                type="button"
                onClick={() => form.setValue('type', 'credit')}
                className={cn(
                  'rounded-md border px-2 py-2 text-xs font-medium transition-colors',
                  type === 'credit'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-input text-muted-foreground hover:text-foreground'
                )}
              >
                Credit (reduce debt)
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adj-amount">Amount ($)</Label>
            <Input
              id="adj-amount"
              type="number"
              step="0.01"
              min={0}
              placeholder="e.g. 50.00"
              {...form.register('amountDollars')}
            />
            {form.formState.errors.amountDollars && (
              <p className="text-xs text-destructive">
                {form.formState.errors.amountDollars.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adj-desc">Reason</Label>
            <Input
              id="adj-desc"
              maxLength={200}
              placeholder="e.g. Late cancellation fee, Referral discount"
              {...form.register('description')}
            />
            {form.formState.errors.description && (
              <p className="text-xs text-destructive">
                {form.formState.errors.description.message}
              </p>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Apply
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
