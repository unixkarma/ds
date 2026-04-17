'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { Loader2, FileText, CheckCircle2, XCircle, ExternalLink } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { InstructorApplication } from '@/types'

interface ReviewDialogProps {
  application: InstructorApplication | null
  docUrls: { workersComp: string | null; carInsurance: string | null } | null
  loadingDocs: boolean
  onClose: () => void
  onReviewed: () => void
}

export function ReviewDialog({
  application,
  docUrls,
  loadingDocs,
  onClose,
  onReviewed,
}: ReviewDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [adminNotes, setAdminNotes] = useState('')
  const [password, setPassword] = useState('')
  const [modality, setModality] = useState<string>('school')
  const [commissionRate, setCommissionRate] = useState('10')
  const [hourlyRate, setHourlyRate] = useState('0')

  const isPending = application?.status === 'pending'

  async function handleAction(action: 'approve' | 'reject') {
    if (!application) return

    if (action === 'approve' && !password) {
      setError('Password is required to create the instructor account')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const res = await fetch(`/api/instructor-applications/${application.id}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          adminNotes,
          password: action === 'approve' ? password : undefined,
          modality: action === 'approve' ? modality : undefined,
          commissionRate: action === 'approve' ? parseFloat(commissionRate) / 100 : undefined,
          hourlyRateCents: action === 'approve' ? parseInt(hourlyRate, 10) * 100 : undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Failed to process review')
        return
      }

      onReviewed()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      setError(null)
      setAdminNotes('')
      setPassword('')
      setModality('school')
      setCommissionRate('10')
      setHourlyRate('0')
      onClose()
    }
  }

  if (!application) return null

  return (
    <Dialog open={!!application} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {application.first_name} {application.last_name}
          </DialogTitle>
          <DialogDescription>
            Applied on {format(new Date(application.created_at), 'MMMM d, yyyy')}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Applicant info */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span>{application.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Phone</span>
            <span>{application.phone || '—'}</span>
          </div>
          {application.service_area && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Service Area</span>
              <span className="text-right max-w-[60%]">{application.service_area}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <Badge
              variant={
                application.status === 'pending'
                  ? 'outline'
                  : application.status === 'approved'
                  ? 'default'
                  : 'destructive'
              }
            >
              {application.status.charAt(0).toUpperCase() + application.status.slice(1)}
            </Badge>
          </div>
        </div>

        <Separator />

        {/* Documents */}
        <div>
          <p className="text-sm font-medium mb-2">Documents</p>
          {loadingDocs ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading documents...
            </div>
          ) : (
            <div className="space-y-2">
              <a
                href={docUrls?.workersComp ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-2 text-sm p-2 rounded-md border ${
                  docUrls?.workersComp
                    ? 'hover:bg-muted cursor-pointer'
                    : 'opacity-50 cursor-not-allowed'
                }`}
              >
                <FileText className="h-4 w-4 text-blue-500" />
                <span className="flex-1">Workers Compensation</span>
                {docUrls?.workersComp && <ExternalLink className="h-3.5 w-3.5" />}
              </a>
              <a
                href={docUrls?.carInsurance ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-2 text-sm p-2 rounded-md border ${
                  docUrls?.carInsurance
                    ? 'hover:bg-muted cursor-pointer'
                    : 'opacity-50 cursor-not-allowed'
                }`}
              >
                <FileText className="h-4 w-4 text-blue-500" />
                <span className="flex-1">Car Insurance</span>
                {docUrls?.carInsurance && <ExternalLink className="h-3.5 w-3.5" />}
              </a>
            </div>
          )}
        </div>

        {/* Already reviewed */}
        {!isPending && application.admin_notes && (
          <>
            <Separator />
            <div>
              <p className="text-sm font-medium mb-1">Admin Notes</p>
              <p className="text-sm text-muted-foreground">{application.admin_notes}</p>
            </div>
          </>
        )}

        {/* Review form — only for pending */}
        {isPending && (
          <>
            <Separator />

            <div className="space-y-4">
              <p className="text-sm font-medium">Review</p>

              {/* Admin Notes */}
              <div>
                <label className="text-sm text-muted-foreground">Notes (optional)</label>
                <Textarea
                  rows={2}
                  placeholder="Add notes about this application..."
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  className="mt-1"
                />
              </div>

              {/* Approval settings */}
              <div className="space-y-3 p-3 border rounded-lg bg-muted/50">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Instructor Account Settings (for approval)
                </p>

                <div>
                  <label className="text-sm">Temporary Password *</label>
                  <Input
                    type="text"
                    placeholder="Min. 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm">Modality</label>
                    <Select value={modality} onValueChange={setModality}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="school">School</SelectItem>
                        <SelectItem value="independent">Independent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm">Commission %</label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={commissionRate}
                      onChange={(e) => setCommissionRate(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm">Hourly Rate ($)</label>
                  <Input
                    type="number"
                    min="0"
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={isSubmitting}
                  onClick={() => handleAction('reject')}
                >
                  {isSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <XCircle className="mr-2 h-4 w-4" />
                  )}
                  Reject
                </Button>
                <Button
                  className="flex-1"
                  disabled={isSubmitting}
                  onClick={() => handleAction('approve')}
                >
                  {isSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  Approve
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
