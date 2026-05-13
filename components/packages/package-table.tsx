'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PlusCircle, Pencil, Trash2, Package } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { PackageDialog } from './package-dialog'
import type { Package as PkgType } from '@/types'

interface PackageTableProps {
  packages: PkgType[]
  singleLessonPriceCents: number
}

export function PackageTable({ packages, singleLessonPriceCents }: PackageTableProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editPkg, setEditPkg] = useState<PkgType | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PkgType | null>(null)

  function handleSaved() {
    startTransition(() => router.refresh())
  }

  function openNew() {
    setEditPkg(null)
    setDialogOpen(true)
  }

  function openEdit(pkg: PkgType) {
    setEditPkg(pkg)
    setDialogOpen(true)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    await fetch(`/api/packages/${deleteTarget.id}`, { method: 'DELETE' })
    setDeleteTarget(null)
    startTransition(() => router.refresh())
  }

  async function toggleActive(pkg: PkgType) {
    await fetch(`/api/packages/${pkg.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !pkg.is_active }),
    })
    startTransition(() => router.refresh())
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {packages.length} package{packages.length !== 1 ? 's' : ''}
          {singleLessonPriceCents > 0 && (
            <span className="ml-2">
              · Single lesson: <strong>${(singleLessonPriceCents / 100).toFixed(2)}</strong>
            </span>
          )}
        </p>
        <Button onClick={openNew}>
          <PlusCircle className="mr-2 h-4 w-4" />
          New Package
        </Button>
      </div>

      {packages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border rounded-lg">
          <Package className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground text-sm">No packages yet.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={openNew}>
            Create your first package
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Package</TableHead>
                <TableHead className="text-center">Program</TableHead>
                <TableHead className="text-center">BTW</TableHead>
                <TableHead className="text-center">Classroom</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packages.map(pkg => (
                <TableRow key={pkg.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{pkg.name}</p>
                      {pkg.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{pkg.description}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="font-normal">
                      {pkg.program_type === 'teen'
                        ? 'Teen'
                        : pkg.program_type === 'adult'
                        ? 'Adult'
                        : 'Both'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">{pkg.lesson_count}</TableCell>
                  <TableCell className="text-center">
                    {pkg.classroom_required ? `${pkg.classroom_required} h` : '—'}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    ${(pkg.price_cents / 100).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-center">
                    <button onClick={() => toggleActive(pkg)}>
                      <Badge variant={pkg.is_active ? 'default' : 'outline'}>
                        {pkg.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </button>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(pkg)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(pkg)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PackageDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        pkg={editPkg}
        onSaved={handleSaved}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete package?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.name}</strong>. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
