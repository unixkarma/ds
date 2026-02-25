import { getVehicles } from '@/lib/services/vehicles'
import { VehicleTable } from '@/components/vehicles/vehicle-table'

export default async function VehiclesPage() {
  const vehicles = await getVehicles()

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vehicles</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage the fleet available for lessons.
        </p>
      </div>
      <VehicleTable vehicles={vehicles} />
    </div>
  )
}
