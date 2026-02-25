import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { VehicleForm } from '@/components/vehicles/vehicle-form'

export default function NewVehiclePage() {
  return (
    <div className="p-6 max-w-xl space-y-6">
      <div>
        <Link
          href="/dashboard/vehicles"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to Vehicles
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Add Vehicle</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Add a new vehicle to your fleet.
        </p>
      </div>
      <VehicleForm />
    </div>
  )
}
