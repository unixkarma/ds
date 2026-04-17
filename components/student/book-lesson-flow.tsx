'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, addDays, isBefore, startOfDay } from 'date-fns'
import { CalendarDays, Clock, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getInitials, DAY_LABELS, formatTime } from '@/lib/utils'
import type { InstructorWithUserAndAvailability } from '@/types'

interface TimeSlot {
  start: string
  end: string
}

interface BookLessonFlowProps {
  studentId: string
  lessonsRemaining: number
  instructors: InstructorWithUserAndAvailability[]
}

export function BookLessonFlow({ studentId, lessonsRemaining, instructors }: BookLessonFlowProps) {
  const router = useRouter()
  const [selectedInstructor, setSelectedInstructor] = useState<InstructorWithUserAndAvailability | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [booking, setBooking] = useState(false)
  const [booked, setBooked] = useState(false)

  // No lessons remaining
  if (lessonsRemaining <= 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          You have no lessons remaining. <a href="/student/packages" className="underline font-medium">Purchase a package</a> to book lessons.
        </AlertDescription>
      </Alert>
    )
  }

  // Generate the next 14 days for date selection
  const today = startOfDay(new Date())
  const dates: Date[] = []
  for (let i = 1; i <= 14; i++) {
    dates.push(addDays(today, i))
  }

  async function handleDateSelect(dateStr: string) {
    if (!selectedInstructor) return
    setSelectedDate(dateStr)
    setSelectedSlot(null)
    setLoadingSlots(true)

    try {
      const res = await fetch(`/api/instructors/${selectedInstructor.id}/available-slots?date=${dateStr}`)
      const data = await res.json()
      setSlots(data.slots ?? [])
    } catch {
      setSlots([])
    } finally {
      setLoadingSlots(false)
    }
  }

  function handleInstructorSelect(instructor: InstructorWithUserAndAvailability) {
    setSelectedInstructor(instructor)
    setSelectedDate(null)
    setSelectedSlot(null)
    setSlots([])
  }

  async function handleBook() {
    if (!selectedInstructor || !selectedDate || !selectedSlot) return

    setBooking(true)
    try {
      const scheduledAt = new Date(`${selectedDate}T${selectedSlot.start}:00`).toISOString()

      const res = await fetch('/api/lessons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          instructorId: selectedInstructor.id,
          scheduledAt,
          durationMinutes: 60,
          vehicleId: null,
          notesAdditional: '',
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error ?? 'Failed to book lesson')
        return
      }

      setBooked(true)
      toast.success('Lesson booked successfully!')
      // Redirect after a short delay so the user sees the success state
      setTimeout(() => router.push('/student'), 2000)
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setBooking(false)
    }
  }

  if (booked) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold">Lesson Booked!</h2>
          <p className="text-muted-foreground mt-2">
            Your lesson with {selectedInstructor!.user.first_name} {selectedInstructor!.user.last_name} on{' '}
            {format(new Date(selectedDate!), 'EEEE, MMMM d')} at {formatTime(selectedSlot!.start + ':00')} has been confirmed.
          </p>
          <p className="text-sm text-muted-foreground mt-1">Redirecting to dashboard...</p>
        </CardContent>
      </Card>
    )
  }

  // Filter dates to only show days the instructor is available
  const availableDayNumbers = selectedInstructor
    ? selectedInstructor.availability.map(a => a.day_of_week)
    : []

  const filteredDates = selectedInstructor
    ? dates.filter(d => availableDayNumbers.includes(d.getDay()))
    : dates

  return (
    <div className="space-y-6">
      {/* Lessons remaining badge */}
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-sm">
          {lessonsRemaining} lesson{lessonsRemaining !== 1 ? 's' : ''} remaining
        </Badge>
      </div>

      {/* Step 1: Pick instructor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</span>
            Choose an Instructor
          </CardTitle>
          {instructors.length === 0 && (
            <CardDescription>No instructors are currently available.</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {instructors.map(inst => {
              const isSelected = selectedInstructor?.id === inst.id
              const hasAvailability = inst.availability.length > 0
              const availDays = [...new Set(inst.availability.map(a => a.day_of_week))]
                .sort((a, b) => ((a === 0 ? 7 : a) - (b === 0 ? 7 : b)))
                .map(d => DAY_LABELS[d].slice(0, 3))

              return (
                <button
                  key={inst.id}
                  onClick={() => hasAvailability && handleInstructorSelect(inst)}
                  disabled={!hasAvailability}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-lg border text-left transition-colors',
                    isSelected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : hasAvailability
                        ? 'hover:border-foreground/20 hover:bg-muted/50'
                        : 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="text-xs">
                      {getInitials(inst.user)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">
                      {inst.user.first_name} {inst.user.last_name}
                    </p>
                    {hasAvailability ? (
                      <p className="text-xs text-muted-foreground truncate">
                        Available: {availDays.join(', ')}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">No availability set</p>
                    )}
                    {inst.service_area && (
                      <p className="text-xs text-muted-foreground truncate">
                        Area: {inst.service_area}
                      </p>
                    )}
                  </div>
                  {isSelected && (
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  )}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Pick date */}
      {selectedInstructor && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</span>
              Pick a Date
            </CardTitle>
            <CardDescription>
              Showing the next 14 days when {selectedInstructor.user.first_name} is available.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredDates.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No available dates in the next 14 days.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {filteredDates.map(date => {
                  const dateStr = format(date, 'yyyy-MM-dd')
                  const isSelected = selectedDate === dateStr
                  return (
                    <button
                      key={dateStr}
                      onClick={() => handleDateSelect(dateStr)}
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

      {/* Step 3: Pick time slot */}
      {selectedDate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">3</span>
              Choose a Time
            </CardTitle>
            <CardDescription>
              Available 1-hour slots on {format(new Date(selectedDate), 'EEEE, MMMM d')}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingSlots ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : slots.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No available slots on this date. Try another day.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {slots.map(slot => {
                  const isSelected = selectedSlot?.start === slot.start
                  return (
                    <button
                      key={slot.start}
                      onClick={() => setSelectedSlot(slot)}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors',
                        isSelected
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'hover:border-foreground/20 hover:bg-muted/50'
                      )}
                    >
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      {formatTime(slot.start + ':00')} – {formatTime(slot.end + ':00')}
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Confirm booking */}
      {selectedSlot && selectedDate && selectedInstructor && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className="font-medium">Confirm Your Booking</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {format(new Date(selectedDate), 'EEEE, MMMM d, yyyy')} at{' '}
                  {formatTime(selectedSlot.start + ':00')} – {formatTime(selectedSlot.end + ':00')}
                </p>
                <p className="text-sm text-muted-foreground">
                  with {selectedInstructor.user.first_name} {selectedInstructor.user.last_name}
                </p>
              </div>
              <Button onClick={handleBook} disabled={booking} size="lg">
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
