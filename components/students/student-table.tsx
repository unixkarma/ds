'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, UserPlus, MoreHorizontal, Pencil, Power } from 'lucide-react'

import { cn, formatDate, getFullName } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { StudentWithUser, StudentStatus } from '@/types'

// ── Status badge ──────────────────────────────────────────────
const statusConfig: Record<StudentStatus, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  active: { label: 'Active', variant: 'default' },
  inactive: { label: 'Inactive', variant: 'secondary' },
  completed: { label: 'Completed', variant: 'outline' },
}

function StatusBadge({ status }: { status: StudentStatus }) {
  const config = statusConfig[status]
  return <Badge variant={config.variant}>{config.label}</Badge>
}

// ── Filter tabs ───────────────────────────────────────────────
const filters: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'completed', label: 'Completed' },
]

// ── Component ─────────────────────────────────────────────────
interface StudentTableProps {
  students: StudentWithUser[]
}

export function StudentTable({ students }: StudentTableProps) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Client-side filtering
  const filtered = students.filter((s) => {
    const fullName = getFullName(s.user).toLowerCase()
    const matchesSearch =
      !search ||
      fullName.includes(search.toLowerCase()) ||
      s.user.email.toLowerCase().includes(search.toLowerCase()) ||
      s.user.phone.includes(search)

    const matchesStatus = statusFilter === 'all' || s.status === statusFilter

    return matchesSearch && matchesStatus
  })

  async function toggleStatus(student: StudentWithUser) {
    setTogglingId(student.id)
    const newStatus = student.status === 'active' ? 'inactive' : 'active'

    await fetch(`/api/students/${student.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })

    router.refresh()
    setTogglingId(null)
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Link href="/dashboard/students/new">
          <Button size="sm">
            <UserPlus className="mr-2 h-4 w-4" />
            Add Student
          </Button>
        </Link>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 border-b">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={cn(
              'px-3 py-2 text-sm font-medium border-b-2 transition-colors',
              statusFilter === f.value
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          {students.length === 0
            ? 'No students yet. Add your first student to get started.'
            : 'No students match your search.'}
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left font-medium text-muted-foreground px-4 py-3">Name</th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3 hidden md:table-cell">
                  Contact
                </th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3 hidden sm:table-cell">
                  Enrolled
                </th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3">
                  Balance
                </th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3">Status</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((student) => {
                const remaining =
                  student.total_lessons_purchased - student.total_lessons_completed
                return (
                  <tr key={student.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/students/${student.id}`}
                        className="font-medium hover:underline"
                      >
                        {getFullName(student.user)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                      <div>{student.user.email}</div>
                      {student.user.phone && (
                        <div className="text-xs">{student.user.phone}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">
                      {formatDate(student.enrollment_date)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'font-medium',
                          remaining === 0 && 'text-muted-foreground',
                          remaining < 0 && 'text-destructive'
                        )}
                      >
                        {remaining} lesson{remaining !== 1 ? 's' : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={student.status} />
                    </td>
                    <td className="px-4 py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Open menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/students/${student.id}/edit`}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => toggleStatus(student)}
                            disabled={togglingId === student.id}
                            className={
                              student.status === 'active'
                                ? 'text-destructive focus:text-destructive'
                                : ''
                            }
                          >
                            <Power className="mr-2 h-4 w-4" />
                            {student.status === 'active' ? 'Deactivate' : 'Reactivate'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {students.length} students
      </p>
    </div>
  )
}
