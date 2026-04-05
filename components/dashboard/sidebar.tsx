'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Calendar,
  Car,
  CreditCard,
  BarChart3,
  Package,
  Settings,
} from 'lucide-react'

import { cn } from '@/lib/utils'

// Navigation items — links marked as 'coming soon' will be disabled until built
const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/students', label: 'Students', icon: Users },
  { href: '/dashboard/instructors', label: 'Instructors', icon: UserCheck },
  { href: '/dashboard/schedule', label: 'Schedule', icon: Calendar },
  { href: '/dashboard/vehicles', label: 'Vehicles', icon: Car },
  { href: '/dashboard/packages', label: 'Packages', icon: Package },
  { href: '/dashboard/payments', label: 'Payments', icon: CreditCard },
  { href: '/dashboard/reports', label: 'Reports', icon: BarChart3 },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

interface SidebarProps {
  schoolName: string
}

export function Sidebar({ schoolName }: SidebarProps) {
  const pathname = usePathname()

  return (
    <div className="flex flex-col h-full">
      {/* School branding */}
      <div className="px-4 py-5 border-b">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm flex-shrink-0">
            H
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{schoolName}</p>
            <p className="text-xs text-muted-foreground">HelixDriving</p>
          </div>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href)
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
