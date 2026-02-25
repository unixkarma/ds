'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PlusCircle, Search, Car } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { VehicleStatusToggle } from './vehicle-status-toggle'
import type { Vehicle } from '@/types'

interface VehicleTableProps {
  vehicles: Vehicle[]
}

export function VehicleTable({ vehicles }: VehicleTableProps) {
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'all' | 'active' | 'inactive'>('all')

  const filtered = vehicles.filter(v => {
    const q = search.toLowerCase()
    const matchesSearch =
      v.make.toLowerCase().includes(q) ||
      v.model.toLowerCase().includes(q) ||
      v.license_plate.toLowerCase().includes(q) ||
      String(v.year).includes(q)

    const matchesTab =
      tab === 'all' ||
      (tab === 'active' && v.is_active) ||
      (tab === 'inactive' && !v.is_active)

    return matchesSearch && matchesTab
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search make, model, plate..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button asChild>
          <Link href="/dashboard/vehicles/new">
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Vehicle
          </Link>
        </Button>
      </div>

      <Tabs value={tab} onValueChange={v => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="all">All ({vehicles.length})</TabsTrigger>
          <TabsTrigger value="active">
            Active ({vehicles.filter(v => v.is_active).length})
          </TabsTrigger>
          <TabsTrigger value="inactive">
            Inactive ({vehicles.filter(v => !v.is_active).length})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Car className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground text-sm">
            {search ? 'No vehicles match your search.' : 'No vehicles yet.'}
          </p>
          {!search && (
            <Button asChild variant="outline" size="sm" className="mt-4">
              <Link href="/dashboard/vehicles/new">Add your first vehicle</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vehicle</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>License Plate</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(vehicle => (
                <TableRow key={vehicle.id}>
                  <TableCell className="font-medium">
                    {vehicle.make} {vehicle.model}
                  </TableCell>
                  <TableCell>{vehicle.year}</TableCell>
                  <TableCell className="font-mono text-sm">{vehicle.license_plate}</TableCell>
                  <TableCell>
                    <Badge variant={vehicle.is_active ? 'default' : 'outline'}>
                      {vehicle.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <VehicleStatusToggle vehicle={vehicle} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
