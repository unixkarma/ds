import { type ReactNode } from 'react'

// Shared layout for all authentication pages (login, register, forgot-password)
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary text-primary-foreground font-bold text-xl mb-3">
            H
          </div>
          <h1 className="text-2xl font-bold tracking-tight">HelixDriving</h1>
          <p className="text-muted-foreground text-sm mt-1">Driving School Management</p>
        </div>

        {children}
      </div>
    </div>
  )
}
