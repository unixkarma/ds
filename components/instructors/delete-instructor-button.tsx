'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface DeleteInstructorButtonProps {
  instructorId: string
  instructorName: string
}

export function DeleteInstructorButton({ instructorId, instructorName }: DeleteInstructorButtonProps) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!confirm(`Are you sure you want to delete ${instructorName}? This action cannot be undone.`)) return
    setDeleting(true)
    const res = await fetch(`/api/instructors/${instructorId}`, { method: 'DELETE' })
    if (res.ok) {
      router.push('/dashboard/instructors')
      router.refresh()
    } else {
      const data = await res.json()
      alert(`Failed to delete: ${data.error}`)
      setDeleting(false)
    }
  }

  return (
    <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
      <Trash2 className="mr-2 h-3.5 w-3.5" />
      {deleting ? 'Deleting...' : 'Delete'}
    </Button>
  )
}
