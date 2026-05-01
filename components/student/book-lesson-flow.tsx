'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { CalendarDays, Clock, Loader2, CheckCircle2, AlertCircle, MapPin } from 'lucide-react'
import { toast } from 'sonner'

import { cn, getInitials, formatTimeRange } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { InstructorWithUser, Opening } from '@/types'

interface BookLessonFlowProps {
  studentId: string
  lessonsRemaining: number
  instructors: InstructorWithUser[]
  openings: Opening[]
  defaultLocation: string
}

// Group an opening's scheduled_at into a YYYY-MM-DD bucket using the local TZ
// (server runs in school TZ — see instrumentation.ts).
function dateKey(iso: string): string {
  const d = new Date(iso)
  return format(d, 'yyyy-MM-dd')
}

// Pretty "HH:MM" out of an ISO string in the local TZ.
function timeKey(iso: string): string {
  return format(new Date(iso), 'HH:mm')
}

export function BookLessonFlow({
  studentId,
  lessonsRemaining,
  instructors,
  openings,
  defaultLocation,
}: BookLessonFlowProps) {
  const router = useRouter()
  const [selectedInstructorId, setSelectedInstructorId] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null)
  const [pickupLocation, setPickupLocation] = useState(defaultLocation)
  const [dropoffLocation, setDropoffLocation] = useState(defaultLocation)
  const [booking, setBooking] = useState(false)
  const [booked, setBooked] = useState(false)

  // Index openings by instructor → date → list, computed once.
  const openingsByInstructor = useMemo(() => {
    const map = new Map<string, Map<string, Opening[]>>()
    for (const o of openings) {
      const dk = dateKey(o.scheduled_at)
      if (!map.has(o.instructor_id)) map.set(o.instructor_id, new Map())
      const byDate = map.get(o.instructor_id)!
      if (!byDate.has(dk)) byDate.set(dk, [])
      byDate.get(dk)!.push(o)
    }
    return map
  }, [openings])

  const selectedInstructor = instructors.find(i => i.id === selectedInstructorId) ?? null
  const datesForInstructor = useMemo(() => {
    if (!selectedInstructorId) return []
    const byDate = openingsByInstructor.get(selectedInstructorId)
    if (!byDate) return []
    return [...byDate.keys()].sort()
  }, [selectedInstructorId, openingsByInstructor])

  const slotsForDate = useMemo(() => {
    if (!selectedInstructorId || !selectedDate) return []
    return openingsByInstructor.get(selectedInstructorId)?.get(selectedDate) ?? []
  }, [selectedInstructorId, selectedDate, openingsByInstructor])

  const selectedOpening = slotsForDate.find(o => o.id === selectedOpeningId) ?? null

  if (lessonsRemaining <= 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          You have no lessons remaining.{' '}
          <a href="/student/packages" className="underline font-medium">
            Purchase a package
          </a>{' '}
          to book lessons.
        </AlertDescription>
      </Alert>
    )
  }

  function handleInstructorSelect(id: string) {
    setSelectedInstructorId(id)
    setSelectedDate(null)
    setSelectedOpeningId(null)
  }

  function handleDateSelect(dk: string) {
    setSelectedDate(dk)
    setSelectedOpeningId(null)
  }

  async function handleBook() {
    if (!selectedOpening) return
    if (!pickupLocation.trim() || !dropoffLocation.trim()) {
      toast.error('Please enter both pickup and drop-off locations.')
      return
    }
    setBooking(true)
    try {
      const res = await fetch('/api/lessons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          openingId: selectedOpening.id,
          pickupLocation: pickupLocation.trim(),
          dropoffLocation: dropoffLocation.trim(),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error ?? 'Failed to book lesson')
        return
      }

      setBooked(true)
      toast.success('Lesson booked successfully!')
      setTimeout(() => router.push('/student'), 2000)
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setBooking(false)
    }
  }

  if (booked && selectedOpening && selectedInstructor) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold">Lesson Booked!</h2>
          <p className="text-muted-foreground mt-2">
            Your lesson with {selectedInstructor.user.first_name} {selectedInstructor.user.last_name} on{' '}
            {format(new Date(selectedOpening.scheduled_at), 'EEEE, MMMM d')} at{' '}
            {formatTimeRange(timeKey(selectedOpening.scheduled_at), selectedOpening.duration_minutes)} has been confirmed.
          </p>
          <p className="text-sm text-muted-foreground mt-1">Redirecting to dashboard...</p>
        </CardContent>
      </Card>
    )
  }

  // Only show instructors that actually have at least one opening to claim.
  const bookableInstructors = instructors.filter(i => openingsByInstructor.has(i.id))

  if (bookableInstructors.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          No instructors have published openings in the next 14 days. Please check back later.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-sm">
          {lessonsRemaining} lesson{lessonsRemaining !== 1 ? 's' : ''} remaining
        </Badge>
      </div>

      {/* Step 1 — Pick instructor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
              1
            </span>
            Choose an Instructor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {bookableInstructors.map(inst => {
              const isSelected = selectedInstructorId === inst.id
              const slotCount = [...(openingsByInstructor.get(inst.id)?.values() ?? [])].reduce(
                (acc, list) => acc + list.length,
                0
              )

              return (
                <button
                  key={inst.id}
                  onClick={() => handleInstructorSelect(inst.id)}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-lg border text-left transition-colors',
                    isSelected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'hover:border-foreground/20 hover:bg-muted/50'
                  )}
                >
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="text-xs">{getInitials(inst.user)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">
                      {inst.user.first_name} {inst.user.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {slotCount} open slot{slotCount !== 1 ? 's' : ''} in the next 14 days
                    </p>
                    {inst.service_area && (
                      <p className="text-xs text-muted-foreground truncate">Area: {inst.service_area}</p>
                    )}
                  </div>
                  {isSelected && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Step 2 — Pick date */}
      {selectedInstructor && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                2
              </span>
              Pick a Date
            </CardTitle>
            <CardDescription>
              Showing days when {selectedInstructor.user.first_name} has open slots.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {datesForInstructor.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No available dates.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {datesForInstructor.map(dk => {
                  const date = new Date(`${dk}T12:00:00`)
                  const isSelected = selectedDate === dk
                  return (
                    <button
                      key={dk}
                      onClick={() => handleDateSelect(dk)}
                      className={cn(
                        'flex flex-col items-center p-2.5 rounded-lg border min-w-[70px] transition-colors',
                        isSelected
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'hover:border-foreground/20 hover:bg-muted/50'
                      )}
                    >
                      <span className="text-xs text-muted-foreground">{format(date, 'EEE')}</span>
                      <span className="text-lg font-bold leading-tight">{format(date, 'd')}</span>
                      <span className="text-xs text-muted-foreground">{format(date, 'MMM')}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3 — Pick time slot */}
      {selectedDate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                3
              </span>
              Choose a Time
            </CardTitle>
            <CardDescription>
              Available slots on {format(new Date(`${selectedDate}T12:00:00`), 'EEEE, MMMM d')}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {slotsForDate.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No slots on this date.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {slotsForDate.map(o => {
                  const isSelected = selectedOpeningId === o.id
                  return (
                    <button
                      key={o.id}
                      onClick={() => setSelectedOpeningId(o.id)}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors',
                        isSelected
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'hover:border-foreground/20 hover:bg-muted/50'
                      )}
                    >
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      {formatTimeRange(timeKey(o.scheduled_at), o.duration_minutes)}
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 4 — Pickup & drop-off */}
      {selectedOpening && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
                4
              </span>
              Pickup &amp; Drop-off
            </CardTitle>
            <CardDescription>
              Include the ZIP code so we can confirm the instructor has time to reach you.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pickup" className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                Pickup address
              </Label>
              <Input
                id="pickup"
                value={pickupLocation}
                onChange={e => setPickupLocation(e.target.value)}
                placeholder="123 N State St, Chicago, IL 60601"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dropoff" className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                Drop-off address
              </Label>
              <Input
                id="dropoff"
                value={dropoffLocation}
                onChange={e => setDropoffLocation(e.target.value)}
                placeholder="123 N State St, Chicago, IL 60601"
              />
              {pickupLocation && dropoffLocation && pickupLocation === dropoffLocation && (
                <p className="text-xs text-muted-foreground">Same as pickup.</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirm */}
      {selectedOpening && selectedInstructor && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className="font-medium">Confirm Your Booking</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {format(new Date(selectedOpening.scheduled_at), 'EEEE, MMMM d, yyyy')} at{' '}
                  {formatTimeRange(timeKey(selectedOpening.scheduled_at), selectedOpening.duration_minutes)}
                </p>
                <p className="text-sm text-muted-foreground">
                  with {selectedInstructor.user.first_name} {selectedInstructor.user.last_name}
                </p>
              </div>
              <Button
                onClick={handleBook}
                disabled={booking || !pickupLocation.trim() || !dropoffLocation.trim()}
                size="lg"
              >
                {booking ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CalendarDays className="mr-2 h-4 w-4" />
                )}
                Book Lesson
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
