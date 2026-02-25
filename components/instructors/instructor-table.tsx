'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, UserPlus, MoreHorizontal, Pencil, Power } from 'lucide-react'

import { cn, getFullName } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { InstructorWithUser } from '@/types'

interface InstructorTableProps {
  instructors: InstructorWithUser[]
}

export function InstructorTable({ instructors }: InstructorTableProps) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const filtered = instructors.filter((inst) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      getFullName(inst.user).toLowerCase().includes(q) ||
      inst.user.email.toLowerCase().includes(q) ||
      inst.license_number.toLowerCase().includes(q)
    )
  })

  async function toggleActive(inst: InstructorWithUser) {
    setTogglingId(inst.id)
    await fetch(`/api/instructors/${inst.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !inst.is_active }),
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
        <Link href="/dashboard/instructors/new">
          <Button size="sm">
            <UserPlus className="mr-2 h-4 w-4" />
            Add Instructor
          </Button>
        </Link>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          {instructors.length === 0
            ? 'No instructors yet. Add your first instructor to get started.'
            : 'No instructors match your search.'}
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
                <th className="text-left font-medium text-muted-foreground px-4 py-3 hidden lg:table-cell">
                  License
                </th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3 hidden sm:table-cell">
                  Max / Day
                </th>
                <th className="text-left font-medium text-muted-foreground px-4 py-3">Status</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((inst) => (
                <tr key={inst.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/instructors/${inst.id}`}
                      className="font-medium hover:underline"
                    >
                      {getFullName(inst.user)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                    <div>{inst.user.email}</div>
                    {inst.user.phone && <div className="text-xs">{inst.user.phone}</div>}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">
                    {inst.license_number || '—'}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">
                    {inst.max_lessons_per_day}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={inst.is_active ? 'default' : 'secondary'}>
                      {inst.is_active ? 'Active' : 'Inactive'}
                    </Badge>
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
                          <Link href={`/dashboard/instructors/${inst.id}/edit`}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => toggleActive(inst)}
                          disabled={togglingId === inst.id}
                          className={cn(inst.is_active && 'text-destructive focus:text-destructive')}
                        >
                          <Power className="mr-2 h-4 w-4" />
                          {inst.is_active ? 'Deactivate' : 'Activate'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {instructors.length} instructors
      </p>
    </div>
  )
}
