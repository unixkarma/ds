'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2, Plus, Lock, Sun, Sunset, CalendarRange, Calendar } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
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
import { TemplateDialog } from '@/components/openings/template-dialog'
import { GenerateOpeningsClient } from '@/components/openings/generate-openings-client'
import { formatTime } from '@/lib/utils'
import type { Opening, OpeningTemplate } from '@/types'

interface TemplatesClientProps {
  instructorId: string
  schoolDefaults: OpeningTemplate[]
  ownTemplates: OpeningTemplate[]
  upcomingOpenings: Opening[]
}

function templateIcon(name: string) {
  const lower = name.toLowerCase()
  if (lower.includes('morning'))   return <Sun className="h-4 w-4" />
  if (lower.includes('afternoon')) return <Sunset className="h-4 w-4" />
  if (lower.includes('full day') || lower.includes('full-day')) return <CalendarRange className="h-4 w-4" />
  return <Calendar className="h-4 w-4" />
}

function TemplateCard({
  template,
  readOnly,
  onEdit,
  onDelete,
}: {
  template: OpeningTemplate
  readOnly: boolean
  onEdit?: () => void
  onDelete?: () => void
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-muted-foreground shrink-0">{templateIcon(template.name)}</div>
            <CardTitle className="text-base truncate">{template.name}</CardTitle>
          </div>
          {readOnly ? (
            <Badge variant="secondary" className="shrink-0 text-xs">
              <Lock className="h-3 w-3 mr-1" />
              School default
            </Badge>
          ) : (
            <div className="flex gap-1 shrink-0">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
        <CardDescription className="text-xs">
          {template.slots.length} {template.slots.length === 1 ? 'slot' : 'slots'} per day
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-1.5">
          {template.slots.map((slot, i) => (
            <Badge key={i} variant="outline" className="font-normal">
              {formatTime(slot.start)} · {slot.duration_min} min
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function TemplatesClient({
  instructorId,
  schoolDefaults,
  ownTemplates,
  upcomingOpenings,
}: TemplatesClientProps) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<OpeningTemplate | null>(null)
  const [deleting, setDeleting] = useState<OpeningTemplate | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  function handleNew() {
    setEditing(null)
    setDialogOpen(true)
  }

  function handleEdit(t: OpeningTemplate) {
    setEditing(t)
    setDialogOpen(true)
  }

  async function handleDeleteConfirm() {
    if (!deleting) return
    setIsDeleting(true)
    const res = await fetch(`/api/opening-templates/${deleting.id}`, { method: 'DELETE' })
    setIsDeleting(false)
    if (res.ok) {
      setDeleting(null)
      router.refresh()
    }
  }

  const allTemplates = [...schoolDefaults, ...ownTemplates]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Templates &amp; Openings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Define your day recipes, then apply them to dates so students can claim slots.
        </p>
      </div>

      <Tabs defaultValue="templates">
        <TabsList>
          <TabsTrigger value="templates">My Templates</TabsTrigger>
          <TabsTrigger value="generate">Generate Openings</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: My Templates ────────────────────────────────── */}
        <TabsContent value="templates" className="space-y-6 pt-2">
          <div className="flex items-center justify-end">
            <Button onClick={handleNew}>
              <Plus className="mr-2 h-4 w-4" />
              New Template
            </Button>
          </div>

          {/* School defaults */}
          {schoolDefaults.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                School defaults
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {schoolDefaults.map(t => (
                  <TemplateCard key={t.id} template={t} readOnly />
                ))}
              </div>
            </section>
          )}

          {/* Own templates */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              My custom templates
            </h2>
            {ownTemplates.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  You haven&apos;t created any custom templates yet. Use the school defaults above, or click{' '}
                  <span className="font-medium">New Template</span> to make your own.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {ownTemplates.map(t => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    readOnly={false}
                    onEdit={() => handleEdit(t)}
                    onDelete={() => setDeleting(t)}
                  />
                ))}
              </div>
            )}
          </section>
        </TabsContent>

        {/* ── Tab 2: Generate Openings ──────────────────────────── */}
        <TabsContent value="generate" className="pt-2">
          <GenerateOpeningsClient
            instructorId={instructorId}
            templates={allTemplates}
            upcomingOpenings={upcomingOpenings}
          />
        </TabsContent>
      </Tabs>

      <TemplateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        template={editing}
        onSaved={() => router.refresh()}
      />

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleting?.name}&quot; will be removed. Existing openings already generated from this template
              are NOT affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
