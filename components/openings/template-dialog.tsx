'use client'

import { useEffect, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { OpeningTemplate } from '@/types'

// All fields z.string() — convert to numbers in onSubmit (project pattern)
const slotFormSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/, 'Format must be HH:MM'),
  duration_min: z.string(),
})

const templateFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(60),
  slots: z.array(slotFormSchema).min(1, 'Add at least one slot'),
})

type TemplateFormValues = z.infer<typeof templateFormSchema>

const DURATION_OPTIONS = [
  { value: '30', label: '30 min' },
  { value: '45', label: '45 min' },
  { value: '60', label: '60 min' },
  { value: '90', label: '90 min' },
  { value: '120', label: '120 min' },
]

// Days ordered Mon–Sun for a work-week feel: 1,2,3,4,5,6,0
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]
const DAY_SHORT_LABELS: Record<number, string> = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' }

interface TemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // template = the row being edited (PATCH). null/undefined = creating new.
  template?: OpeningTemplate | null
  // prefillFrom = a starter to copy slots/days/name from (used when "Use this template"
  // is clicked on a school default). Always creates a new instructor-scoped template.
  prefillFrom?: OpeningTemplate | null
  onSaved: () => void
}

export function TemplateDialog({
  open,
  onOpenChange,
  template,
  prefillFrom,
  onSaved,
}: TemplateDialogProps) {
  const isEdit = !!template
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]))
  const [submitting, setSubmitting] = useState(false)

  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      name: '',
      slots: [{ start: '09:00', duration_min: '60' }],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'slots',
  })

  useEffect(() => {
    const source = template ?? prefillFrom
    if (source) {
      form.reset({
        name: template ? source.name : `My ${source.name}`,
        slots: source.slots.map(s => ({
          start: s.start,
          duration_min: String(s.duration_min),
        })),
      })
      setDays(new Set(source.day_of_week ?? [1, 2, 3, 4, 5]))
    } else {
      form.reset({
        name: '',
        slots: [{ start: '09:00', duration_min: '60' }],
      })
      setDays(new Set([1, 2, 3, 4, 5]))
    }
    setError(null)
  }, [template, prefillFrom, form, open])

  function toggleDay(d: number) {
    setDays(prev => {
      const next = new Set(prev)
      if (next.has(d)) next.delete(d)
      else next.add(d)
      return next
    })
  }

  async function onSubmit(values: TemplateFormValues) {
    setError(null)

    if (days.size === 0) {
      setError('Pick at least one day of the week.')
      return
    }

    const payload = {
      name: values.name,
      slots: values.slots.map(s => ({
        start: s.start,
        duration_min: parseInt(s.duration_min, 10),
      })),
      day_of_week: Array.from(days).sort(),
    }

    setSubmitting(true)
    const res = isEdit
      ? await fetch(`/api/opening-templates/${template!.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch('/api/opening-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
    setSubmitting(false)

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Failed to save template')
      return
    }

    onSaved()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Edit Template' : prefillFrom ? `Customize "${prefillFrom.name}"` : 'New Template'}
          </DialogTitle>
          <DialogDescription>
            {prefillFrom
              ? 'Tweak the days, slots, or name to fit your week. Saving creates a new template under your control.'
              : 'Pick the days and slots. The system will auto-generate openings for the next 14 days.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">Template Name</Label>
            <Input id="tpl-name" placeholder="My Mornings" {...form.register('name')} />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          {/* Day-of-week selector */}
          <div className="space-y-1.5">
            <Label>Days</Label>
            <div className="flex flex-wrap gap-1.5">
              {DAY_ORDER.map(d => {
                const active = days.has(d)
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input hover:bg-accent'
                    }`}
                  >
                    {DAY_SHORT_LABELS[d]}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Slots</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ start: '09:00', duration_min: '60' })}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add slot
              </Button>
            </div>

            <div className="space-y-2">
              {fields.map((field, index) => (
                <div key={field.id} className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">Start</Label>
                    <Input
                      type="time"
                      value={form.watch(`slots.${index}.start`)}
                      onChange={(e) => form.setValue(`slots.${index}.start`, e.target.value, { shouldDirty: true })}
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">Duration</Label>
                    <Select
                      value={form.watch(`slots.${index}.duration_min`)}
                      onValueChange={(v) => form.setValue(`slots.${index}.duration_min`, v, { shouldDirty: true })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DURATION_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(index)}
                    disabled={fields.length <= 1}
                    className="text-destructive hover:text-destructive shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            {form.formState.errors.slots && !Array.isArray(form.formState.errors.slots) && (
              <p className="text-xs text-destructive">{form.formState.errors.slots.message}</p>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Create Template'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
