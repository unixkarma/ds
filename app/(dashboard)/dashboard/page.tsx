import { Suspense } from 'react'
import { Users, CalendarDays, DollarSign, Clock } from 'lucide-react'
import type { Metadata } from 'next'

import { getDashboardStats } from '@/lib/services/dashboard'
import { formatCurrency, formatDateTime, formatHours, getFullName } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { DashboardStats } from '@/types'

export const metadata: Metadata = { title: 'Dashboard' }

// ── Stat card ─────────────────────────────────────────────────
function StatCard({
  title,
  value,
  icon: Icon,
  description,
}: {
  title: string
  value: string | number
  icon: React.ElementType
  description: string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  )
}

// ── Upcoming lessons table ────────────────────────────────────
function UpcomingLessons({ stats }: { stats: DashboardStats }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Upcoming Lessons</CardTitle>
      </CardHeader>
      <CardContent>
        {stats.upcomingLessons.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No upcoming lessons scheduled yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left font-medium text-muted-foreground pb-3 pr-4">
                    Student
                  </th>
                  <th className="text-left font-medium text-muted-foreground pb-3 pr-4">
                    Instructor
                  </th>
                  <th className="text-left font-medium text-muted-foreground pb-3 pr-4">
                    Date &amp; Time
                  </th>
                  <th className="text-left font-medium text-muted-foreground pb-3">
                    Duration
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {stats.upcomingLessons.map((lesson) => (
                  <tr key={lesson.id}>
                    <td className="py-3 pr-4 font-medium">
                      {getFullName(lesson.student.user)}
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {getFullName(lesson.instructor.user)}
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {formatDateTime(lesson.scheduled_at)}
                    </td>
                    <td className="py-3">
                      <Badge variant="secondary">{formatHours(lesson.duration_minutes)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Dashboard content (async — fetches real data) ─────────────
async function DashboardContent() {
  let stats: DashboardStats

  try {
    stats = await getDashboardStats()
  } catch (err) {
    console.error('Failed to load dashboard stats:', err)
    return (
      <p className="text-sm text-destructive">
        Failed to load dashboard data. Please refresh the page.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Active Students"
          value={stats.totalActiveStudents}
          icon={Users}
          description="Currently enrolled"
        />
        <StatCard
          title="Lessons Today"
          value={stats.lessonsTodayCount}
          icon={CalendarDays}
          description="Scheduled for today"
        />
        <StatCard
          title="Revenue This Month"
          value={formatCurrency(stats.revenueThisMonthCents)}
          icon={DollarSign}
          description="From completed payments"
        />
        <StatCard
          title="Upcoming Lessons"
          value={stats.upcomingLessons.length}
          icon={Clock}
          description="Scheduled from now"
        />
      </div>

      {/* Upcoming lessons */}
      <UpcomingLessons stats={stats} />
    </div>
  )
}

// ── Loading skeleton ──────────────────────────────────────────
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-28" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-32 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-36" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────
export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold mb-6">Dashboard</h1>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  )
}
