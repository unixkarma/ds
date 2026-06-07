'use client'

import { useRouter } from 'next/navigation'
import { Menu, LogOut } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { getInitials } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Sidebar } from './sidebar'

interface HeaderProps {
  user: {
    firstName: string
    lastName: string
    email: string
  }
  schoolName: string
  pendingApplications?: number
  pendingDaysOff?: number
}

export function Header({ user, schoolName, pendingApplications = 0, pendingDaysOff = 0 }: HeaderProps) {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const initials = getInitials({ first_name: user.firstName, last_name: user.lastName })
  const fullName = `${user.firstName} ${user.lastName}`.trim()

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between h-14 px-4 border-b bg-background">
      {/* Mobile: hamburger menu */}
      <div className="flex items-center gap-3">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open navigation menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-60 p-0 gap-0">
            {/* Visually hidden title for screen readers */}
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <Sidebar schoolName={schoolName} pendingApplications={pendingApplications} pendingDaysOff={pendingDaysOff} />
          </SheetContent>
        </Sheet>

        {/* School name — only visible on mobile (sidebar handles it on desktop) */}
        <span className="font-semibold text-sm md:hidden">{schoolName}</span>
      </div>

      {/* Right side: user avatar + dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-8 w-8 rounded-full p-0">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs bg-muted">{initials}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="font-normal">
            <p className="font-medium text-sm">{fullName || 'My Account'}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleLogout}
            className="text-destructive cursor-pointer focus:text-destructive"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
