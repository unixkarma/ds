'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import type { Package } from '@/types'

const packageSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string(),
  lesson_count: z.string().min(1, 'Lesson count is required'),
  price_cents: z.string().min(1, 'Price is required'),
})

type PackageValues = z.infer<typeof packageSchema>

interface PackageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pkg?: Package | null
  onSaved: () => void
}

export function PackageDialog({ open, onOpenChange, pkg, onSaved }: PackageDialogProps) {
  const isEdit = !!pkg

  const form = useForm<PackageValues>({
    resolver: zodResolver(packageSchema),
    defaultValues: {
      name: '',
      description: '',
      lesson_count: '',
      price_cents: '',
    },
  })

  useEffect(() => {
    if (pkg) {
      form.reset({
        name: pkg.name,
        description: pkg.description,
        lesson_count: String(pkg.lesson_count),
        price_cents: String(pkg.price_cents),
      })
    } else {
      form.reset({ name: '', description: '', lesson_count: '', price_cents: '' })
    }
  }, [pkg, form])

  async function onSubmit(values: PackageValues) {
    const payload = {
      name: values.name,
      description: values.description,
      lesson_count: parseInt(values.lesson_count, 10),
      price_cents: parseInt(values.price_cents, 10),
    }

    const res = isEdit
      ? await fetch(`/api/packages/${pkg!.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch('/api/packages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

    if (!res.ok) return

    onSaved()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Package' : 'New Package'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="pkg-name">Package Name</Label>
            <Input id="pkg-name" placeholder="Basic — 10 Lessons" {...form.register('name')} />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pkg-description">Description (optional)</Label>
            <Textarea
              id="pkg-description"
              placeholder="Best for beginners"
              rows={2}
              {...form.register('description')}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pkg-lessons">Number of Lessons</Label>
              <Input
                id="pkg-lessons"
                placeholder="10"
                {...form.register('lesson_count')}
              />
              {form.formState.errors.lesson_count && (
                <p className="text-xs text-destructive">{form.formState.errors.lesson_count.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pkg-price">Price (cents)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="pkg-price"
                  placeholder="49900"
                  {...form.register('price_cents')}
                />
              </div>
              {form.watch('price_cents') && (
                <p className="text-xs text-muted-foreground">
                  = ${(parseInt(form.watch('price_cents') || '0', 10) / 100).toFixed(2)}
                </p>
              )}
              {form.formState.errors.price_cents && (
                <p className="text-xs text-destructive">{form.formState.errors.price_cents.message}</p>
              )}
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Package'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
