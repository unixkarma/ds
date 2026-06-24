'use client'

import { useState, useCallback, useMemo } from 'react'
import { ChevronLeft, ChevronRight, CalendarPlus, Users, User } from 'lucide-react'
import { format } from 'date-fns'

import { getFullName } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { WeekView } from '@/components/schedule/week-view'
import { MultiInstructorView } from '@/components/schedule/multi-instructor-view'
import { BookLessonDialog } from '@/components/schedule/book-lesson-dialog'
import { LessonDetailDialog } from '@/components/schedule/lesson-detail-dialog'
import type { LessonWithRelations, StudentWithUser, InstructorWithUser, Vehicle, Opening, InstructorAssignmentWithInstructor } from '@/types'

type ViewMode = 'single' | 'multi'

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
  initialOpenings: Opening[]
  initialAssignments: InstructorAssignmentWithInstructor[]
  initialWeekStart: string
  students: StudentWithUser[]
  instructors: InstructorWithUser[]
  vehicles: Vehicle[]
}

export function ScheduleClient({
  initialLessons,
  initialOpenings,
  initialAssignments,
  initialWeekStart,
  students,
  instructors,
  vehicles,
}: ScheduleClientProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('multi')
  const [weekStart, setWeekStart] = useState<Date>(new Date(initialWeekStart))
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [lessons, setLessons] = useState<LessonWithRelations[]>(initialLessons)
  const [openings, setOpenings] = useState<Opening[]>(initialOpenings)
  const [assignments, setAssignments] = useState<InstructorAssignmentWithInstructor[]>(initialAssignments)
  const [isLoadingWeek, setIsLoadingWeek] = useState(false)
  const [bookingOpen, setBookingOpen] = useState(false)
  const [selectedLesson, setSelectedLesson] = useState<LessonWithRelations | null>(null)
  const [selectedInstructorId, setSelectedInstructorId] = useState<string>('all')

  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 7)

  // ── Labels ──────────────────────────────────────────────────
  const weekLabel = (() => {
    const startMonth = format(weekStart, 'MMM d')
    const endDate = new Date(weekEnd)
    endDate.setDate(endDate.getDate() - 1)
    const endMonth = format(endDate, 'MMM d, yyyy')
    return `${startMonth} – ${endMonth}`
  })()

  const dayLabel = format(selectedDate, 'EEEE, MMM d, yyyy')

  // ── Filtered lessons + openings ─────────────────────────────
  const filteredLessons = useMemo(() => {
    if (viewMode === 'multi' || selectedInstructorId === 'all') return lessons
    return lessons.filter((l) => l.instructor_id === selectedInstructorId)
  }, [lessons, selectedInstructorId, viewMode])

  const filteredOpenings = useMemo(() => {
    if (viewMode === 'multi' || selectedInstructorId === 'all') return openings
    return openings.filter((o) => o.instructor_id === selectedInstructorId)
  }, [openings, selectedInstructorId, viewMode])

  const filteredAssignments = useMemo(() => {
    if (viewMode === 'multi' || selectedInstructorId === 'all') return assignments
    return assignments.filter((a) => a.instructor_id === selectedInstructorId)
  }, [assignments, selectedInstructorId, viewMode])

  // ── Data loading ────────────────────────────────────────────
  async function loadLessonsAndOpenings(start: Date, end: Date) {
    setIsLoadingWeek(true)
    try {
      const [lessonsRes, openingsRes, assignmentsRes] = await Promise.all([
        fetch(`/api/lessons?start=${start.toISOString()}&end=${end.toISOString()}`),
        fetch(
          `/api/openings?start=${start.toISOString()}&end=${end.toISOString()}&status=available,blocked`
        ),
        fetch(`/api/assignments?start=${start.toISOString()}&end=${end.toISOString()}`),
      ])
      if (lessonsRes.ok) {
        const data = await lessonsRes.json()
        setLessons(data.lessons ?? [])
      }
      if (openingsRes.ok) {
        const data = await openingsRes.json()
        setOpenings(data.openings ?? [])
      }
      if (assignmentsRes.ok) {
        const data = await assignmentsRes.json()
        setAssignments(data.assignments ?? [])
      }
    } finally {
      setIsLoadingWeek(false)
    }
  }

  async function loadWeek(newWeekStart: Date) {
    const end = new Date(newWeekStart)
    end.setDate(end.getDate() + 7)
    await loadLessonsAndOpenings(newWeekStart, end)
  }

  async function loadDay(date: Date) {
    const start = new Date(date)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    await loadLessonsAndOpenings(start, end)
  }

  // ── Navigation — Single Instructor (week) ──────────────────
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

  // ── Navigation — Multi Instructor (day) ────────────────────
  function goToPrevDay() {
    const prev = new Date(selectedDate)
    prev.setDate(prev.getDate() - 1)
    setSelectedDate(prev)
    loadDay(prev)
  }

  function goToNextDay() {
    const next = new Date(selectedDate)
    next.setDate(next.getDate() + 1)
    setSelectedDate(next)
    loadDay(next)
  }

  function goToToday() {
    const today = new Date()
    setSelectedDate(today)
    loadDay(today)
  }

  // ── View switch ─────────────────────────────────────────────
  function switchView(mode: ViewMode) {
    setViewMode(mode)
    if (mode === 'multi') {
      // Load the currently selected day
      loadDay(selectedDate)
    } else {
      // Load the current week
      const ws = getWeekStart(selectedDate)
      setWeekStart(ws)
      loadWeek(ws)
    }
  }

  // ── Callbacks ───────────────────────────────────────────────
  const handleLessonClick = useCallback((lesson: LessonWithRelations) => {
    setSelectedLesson(lesson)
  }, [])

  function handleBookingOpenChange(open: boolean) {
    setBookingOpen(open)
    if (!open) {
      if (viewMode === 'multi') loadDay(selectedDate)
      else loadWeek(weekStart)
    }
  }

  function handleLessonClose() {
    setSelectedLesson(null)
    if (viewMode === 'multi') loadDay(selectedDate)
    else loadWeek(weekStart)
  }

  const todayDateStr = format(new Date(), 'yyyy-MM-dd')

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {/* Nav arrows */}
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={viewMode === 'multi' ? goToPrevDay : goToPrevWeek}
            disabled={isLoadingWeek}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={viewMode === 'multi' ? goToNextDay : goToNextWeek}
            disabled={isLoadingWeek}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={viewMode === 'multi' ? goToToday : goToCurrentWeek}
            disabled={isLoadingWeek}
          >
            Today
          </Button>
          <h2 className="text-sm sm:text-base font-semibold ml-1 tabular-nums truncate">
            {viewMode === 'multi' ? dayLabel : weekLabel}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {/* Instructor filter — single view only */}
          {viewMode === 'single' && (
            <Select value={selectedInstructorId} onValueChange={setSelectedInstructorId}>
              <SelectTrigger className="w-full sm:w-[180px] h-9 text-sm">
                <SelectValue placeholder="All Instructors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Instructors</SelectItem>
                {instructors
                  .filter((i) => i.is_active)
                  .map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {getFullName(i.user)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}

          {/* View toggle */}
          <div className="flex rounded-md border overflow-hidden">
            <Button
              variant={viewMode === 'single' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-none gap-1.5"
              onClick={() => switchView('single')}
            >
              <User className="h-3.5 w-3.5" />
              Single
            </Button>
            <Button
              variant={viewMode === 'multi' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-none gap-1.5"
              onClick={() => switchView('multi')}
            >
              <Users className="h-3.5 w-3.5" />
              Multi
            </Button>
          </div>

          <Button onClick={() => setBookingOpen(true)}>
            <CalendarPlus className="mr-2 h-4 w-4" />
            Book Lesson
          </Button>
        </div>
      </div>

      {/* Calendar */}
      <div className={isLoadingWeek ? 'opacity-60 pointer-events-none transition-opacity' : ''}>
        {viewMode === 'single' ? (
          <WeekView
            lessons={filteredLessons}
            openings={filteredOpenings}
            assignments={filteredAssignments}
            weekStart={weekStart}
            onLessonClick={handleLessonClick}
            instructors={instructors}
          />
        ) : (
          <MultiInstructorView
            lessons={lessons}
            openings={openings}
            assignments={assignments}
            instructors={instructors}
            selectedDate={selectedDate}
            onLessonClick={handleLessonClick}
          />
        )}
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
