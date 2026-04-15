'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Loader2, CheckCircle2, ImageIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface PermitUploadProps {
  studentId: string
  existingUrl?: string
}

export function PermitUpload({ studentId, existingUrl }: PermitUploadProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [photoUrl, setPhotoUrl] = useState(existingUrl || '')

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`/api/students/${studentId}/permit-photo`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Upload failed')
        return
      }

      const data = await res.json()
      setPhotoUrl(data.url)
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ImageIcon className="h-4 w-4" />
          Learner&apos;s Permit
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {photoUrl ? (
          <div className="space-y-3">
            <div className="relative rounded-lg overflow-hidden border bg-muted">
              <img
                src={photoUrl}
                alt="Learner's permit"
                className="w-full max-h-[300px] object-contain"
              />
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="text-sm text-muted-foreground">Permit photo uploaded</span>
            </div>
          </div>
        ) : (
          <div className="border-2 border-dashed rounded-lg p-8 text-center">
            <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No permit photo uploaded yet
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleUpload}
          className="hidden"
        />

        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="mr-2 h-3.5 w-3.5" />
          )}
          {photoUrl ? 'Replace Photo' : 'Upload Photo'}
        </Button>

        <p className="text-xs text-muted-foreground">
          JPEG, PNG, or WebP. Max 5 MB.
        </p>
      </CardContent>
    </Card>
  )
}
