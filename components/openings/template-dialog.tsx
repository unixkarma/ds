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

interface TemplateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  template?: OpeningTemplate | null
  onSaved: () => void
}

export function TemplateDialog({ open, onOpenChange, template, onSaved }: TemplateDialogProps) {
  const isEdit = !!template
  const [error, setError] = useState<string | null>(null)

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
    if (template) {
      form.reset({
        name: template.name,
        slots: template.slots.map(s => ({
          start: s.start,
          duration_min: String(s.duration_min),
        })),
      })
    } else {
      form.reset({
        name: '',
        slots: [{ start: '09:00', duration_min: '60' }],
      })
    }
    setError(null)
  }, [template, form, open])

  async function onSubmit(values: TemplateFormValues) {
    setError(null)

    const payload = {
      name: values.name,
      slots: values.slots.map(s => ({
        start: s.start,
        duration_min: parseInt(s.duration_min, 10),
      })),
    }

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
          <DialogTitle>{isEdit ? 'Edit Template' : 'New Template'}</DialogTitle>
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
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Create Template'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
