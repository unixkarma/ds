'use client'

import { useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, CalendarPlus } from 'lucide-react'
import { format } from 'date-fns'

import { Button } from '@/components/ui/button'
import { WeekView } from '@/components/schedule/week-view'
import { BookLessonDialog } from '@/components/schedule/book-lesson-dialog'
import { LessonDetailDialog } from '@/components/schedule/lesson-detail-dialog'
import type { LessonWithRelations, StudentWithUser, InstructorWithUser, Vehicle } from '@/types'

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

interface ScheduleClientProps {
  initialLessons: LessonWithRelations[]
  initialWeekStart: string // ISO string of the week's Monday
  students: StudentWithUser[]
  instructors: InstructorWithUser[]
  vehicles: Vehicle[]
}

export function ScheduleClient({
  initialLessons,
  initialWeekStart,
  students,
  instructors,
  vehicles,
}: ScheduleClientProps) {
  const [weekStart, setWeekStart] = useState<Date>(new Date(initialWeekStart))
  const [lessons, setLessons] = useState<LessonWithRelations[]>(initialLessons)
  const [isLoadingWeek, setIsLoadingWeek] = useState(false)
  const [bookingOpen, setBookingOpen] = useState(false)
  const [selectedLesson, setSelectedLesson] = useState<LessonWithRelations | null>(null)

  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 7)

  const weekLabel = (() => {
    const startMonth = format(weekStart, 'MMM d')
    const endDate = new Date(weekEnd)
    endDate.setDate(endDate.getDate() - 1)
    const endMonth = format(endDate, 'MMM d, yyyy')
    return `${startMonth} – ${endMonth}`
  })()

  async function loadWeek(newWeekStart: Date) {
    setIsLoadingWeek(true)
    try {
      const end = new Date(newWeekStart)
      end.setDate(end.getDate() + 7)

      const res = await fetch(
        `/api/lessons?start=${newWeekStart.toISOString()}&end=${end.toISOString()}`
      )
      if (res.ok) {
        const data = await res.json()
        setLessons(data.lessons ?? [])
      }
    } finally {
      setIsLoadingWeek(false)
    }
  }

  function goToPrevWeek() {
    const prev = new Date(weekStart)
    prev.setDate(prev.getDate() - 7)
    setWeekStart(prev)
    loadWeek(prev)
  }

  function goToNextWeek() {
    const next = new Date(weekStart)
    next.setDate(next.getDate() + 7)
    setWeekStart(next)
    loadWeek(next)
  }

  function goToCurrentWeek() {
    const current = getWeekStart(new Date())
    setWeekStart(current)
    loadWeek(current)
  }

  const handleLessonClick = useCallback((lesson: LessonWithRelations) => {
    setSelectedLesson(lesson)
  }, [])

  // After any mutation (book/cancel/reschedule), reload the current week
  function handleBookingOpenChange(open: boolean) {
    setBookingOpen(open)
    if (!open) loadWeek(weekStart)
  }

  function handleLessonClose() {
    setSelectedLesson(null)
    loadWeek(weekStart)
  }

  const todayDateStr = format(new Date(), 'yyyy-MM-dd')

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goToPrevWeek} disabled={isLoadingWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={goToNextWeek} disabled={isLoadingWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToCurrentWeek} disabled={isLoadingWeek}>
            Today
          </Button>
          <h2 className="text-base font-semibold ml-1 tabular-nums">{weekLabel}</h2>
        </div>

        <Button onClick={() => setBookingOpen(true)}>
          <CalendarPlus className="mr-2 h-4 w-4" />
          Book Lesson
        </Button>
      </div>

      {/* Calendar */}
      <div className={isLoadingWeek ? 'opacity-60 pointer-events-none transition-opacity' : ''}>
        <WeekView
          lessons={lessons}
          weekStart={weekStart}
          onLessonClick={handleLessonClick}
        />
      </div>

      {/* Dialogs */}
      <BookLessonDialog
        open={bookingOpen}
        onOpenChange={handleBookingOpenChange}
        students={students}
        instructors={instructors}
        vehicles={vehicles}
        defaultDate={todayDateStr}
      />

      <LessonDetailDialog
        lesson={selectedLesson}
        onClose={handleLessonClose}
      />
    </div>
  )
}
