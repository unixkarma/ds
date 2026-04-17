'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ClipboardList, ExternalLink, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ReviewDialog } from './review-dialog'
import type { InstructorApplication, ApplicationStatus } from '@/types'

interface ApplicationsTableProps {
  applications: InstructorApplication[]
}

const statusVariant: Record<ApplicationStatus, 'default' | 'outline' | 'destructive'> = {
  pending: 'outline',
  approved: 'default',
  rejected: 'destructive',
}

export function ApplicationsTable({ applications }: ApplicationsTableProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [reviewTarget, setReviewTarget] = useState<InstructorApplication | null>(null)
  const [docUrls, setDocUrls] = useState<{ workersComp: string | null; carInsurance: string | null } | null>(null)
  const [loadingDocs, setLoadingDocs] = useState(false)

  // Filter
  const filtered = applications.filter((app) => {
    const matchesSearch =
      search === '' ||
      `${app.first_name} ${app.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
      app.email.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'all' || app.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const pendingCount = applications.filter((a) => a.status === 'pending').length

  async function openReview(app: InstructorApplication) {
    setReviewTarget(app)
    setDocUrls(null)
    setLoadingDocs(true)

    try {
      const res = await fetch(`/api/instructor-applications/${app.id}/documents`)
      if (res.ok) {
        const data = await res.json()
        setDocUrls(data)
      }
    } catch {
      // Docs will just show as unavailable
    } finally {
      setLoadingDocs(false)
    }
  }

  function handleReviewed() {
    setReviewTarget(null)
    startTransition(() => router.refresh())
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending ({pendingCount})</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table or empty */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border rounded-lg">
          <ClipboardList className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground text-sm">
            {applications.length === 0
              ? 'No applications yet.'
              : 'No applications match your filters.'}
          </p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Applicant</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead>Applied</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((app) => (
                <TableRow key={app.id}>
                  <TableCell className="font-medium">
                    {app.first_name} {app.last_name}
                  </TableCell>
                  <TableCell className="text-sm">{app.email}</TableCell>
                  <TableCell className="text-sm">{app.phone || '—'}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={statusVariant[app.status]}>
                      {app.status.charAt(0).toUpperCase() + app.status.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(app.created_at), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openReview(app)}
                    >
                      <ExternalLink className="mr-1 h-3.5 w-3.5" />
                      Review
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Review dialog */}
      <ReviewDialog
        application={reviewTarget}
        docUrls={docUrls}
        loadingDocs={loadingDocs}
        onClose={() => setReviewTarget(null)}
        onReviewed={handleReviewed}
      />
    </div>
  )
}
