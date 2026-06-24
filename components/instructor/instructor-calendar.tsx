'use client'

import { useState, useEffect, useMemo } from 'react'
import { format, addDays, startOfWeek, isSameDay } from 'date-fns'
import { ChevronLeft, ChevronRight, MapPin, Clock, Car, GraduationCap, Users, ClipboardList } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { LessonWithRelations, ClassroomSessionWithRelations, InstructorAssignmentWithInstructor } from '@/types'

// ── Constants ────────────────────────────────────────────────
const HOUR_HEIGHT = 72
const START_HOUR = 6
const END_HOUR = 22
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)
const PX_PER_MIN = HOUR_HEIGHT / 60

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 border-blue-400 text-blue-900',
  completed: 'bg-emerald-100 border-emerald-400 text-emerald-900',
  cancelled: 'bg-gray-100 border-gray-300 text-gray-400',
  no_show: 'bg-red-100 border-red-400 text-red-900',
}

// Classroom sessions get a distinct (purple) palette so they're easy to tell
// apart from behind-the-wheel lessons.
const CLASSROOM_COLORS: Record<string, string> = {
  scheduled: 'bg-purple-100 border-purple-400 text-purple-900',
  completed: 'bg-violet-100 border-violet-400 text-violet-900',
  cancelled: 'bg-gray-100 border-gray-300 text-gray-400',
}

const ASSIGNMENT_COLORS: Record<string, string> = {
  scheduled: 'bg-amber-100 border-amber-400 text-amber-900',
  completed: 'bg-amber-200 border-amber-500 text-amber-900',
  cancelled: 'bg-gray-100 border-gray-300 text-gray-400',
}

function formatHour(hour: number): string {
  if (hour === 0) return '12 AM'
  if (hour === 12) return '12 PM'
  if (hour > 12) return `${hour - 12} PM`
  return `${hour} AM`
}

function formatTime(hour: number, min: number): string {
  const h = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  const ampm = hour >= 12 ? 'PM' : 'AM'
  return `${h}:${String(min).padStart(2, '0')} ${ampm}`
}

// ── Component ────────────────────────────────────────────────
interface InstructorCalendarProps {
  instructorId: string
  bufferMinutes: number
}

export function InstructorCalendar({ instructorId, bufferMinutes }: InstructorCalendarProps) {
  const [weekStart, setWeekStart] = useState<Date>(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )
  const [lessons, setLessons] = useState<LessonWithRelations[]>([])
  const [sessions, setSessions] = useState<ClassroomSessionWithRelations[]>([])
  const [assignments, setAssignments] = useState<InstructorAssignmentWithInstructor[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedLesson, setSelectedLesson] = useState<LessonWithRelations | null>(null)
  const [selectedSession, setSelectedSession] = useState<ClassroomSessionWithRelations | null>(null)

  const weekEnd = addDays(weekStart, 7)
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const today = new Date()
  const totalHeight = HOURS.length * HOUR_HEIGHT

  // Fetch lessons for the week
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [lessonsRes, sessionsRes, assignmentsRes] = await Promise.all([
          fetch(`/api/lessons?start=${weekStart.toISOString()}&end=${weekEnd.toISOString()}`),
          fetch(`/api/classroom?start=${weekStart.toISOString()}&end=${weekEnd.toISOString()}`),
          fetch(`/api/assignments?start=${weekStart.toISOString()}&end=${weekEnd.toISOString()}`),
        ])
        if (cancelled) return
        if (lessonsRes.ok) {
          const data = await lessonsRes.json()
          // Filter to this instructor's lessons only
          const mine = (data.lessons ?? []).filter(
            (l: LessonWithRelations) => l.instructor_id === instructorId
          )
          setLessons(mine)
        }
        if (sessionsRes.ok) {
          const data = await sessionsRes.json()
          // Only the classroom sessions this instructor is teaching
          const mine = (data.sessions ?? []).filter(
            (s: ClassroomSessionWithRelations) => s.instructor_id === instructorId
          )
          setSessions(mine)
        }
        if (assignmentsRes.ok) {
          const data = await assignmentsRes.json()
          const mine = (data.assignments ?? []).filter(
            (a: InstructorAssignmentWithInstructor) => a.instructor_id === instructorId
          )
          setAssignments(mine)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [weekStart, weekEnd, instructorId])

  // Lessons grouped by day
  const lessonsByDay = useMemo(() => {
    const map = new Map<string, LessonWithRelations[]>()
    for (const lesson of lessons) {
      const key = format(new Date(lesson.scheduled_at), 'yyyy-MM-dd')
      const arr = map.get(key) ?? []
      arr.push(lesson)
      map.set(key, arr)
    }
    // Sort each day's lessons by time
    for (const arr of map.values()) {
      arr.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    }
    return map
  }, [lessons])

  // Classroom sessions grouped by day
  const sessionsByDay = useMemo(() => {
    const map = new Map<string, ClassroomSessionWithRelations[]>()
    for (const session of sessions) {
      const key = format(new Date(session.scheduled_at), 'yyyy-MM-dd')
      const arr = map.get(key) ?? []
      arr.push(session)
      map.set(key, arr)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    }
    return map
  }, [sessions])

  // Assignments grouped by day
  const assignmentsByDay = useMemo(() => {
    const map = new Map<string, InstructorAssignmentWithInstructor[]>()
    for (const a of assignments) {
      const key = format(new Date(a.scheduled_at), 'yyyy-MM-dd')
      const arr = map.get(key) ?? []
      arr.push(a)
      map.set(key, arr)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    }
    return map
  }, [assignments])

  // Week stats
  const weekLessonCount = lessons.filter(l => l.status === 'scheduled' || l.status === 'completed').length
  const weekHours = lessons
    .filter(l => l.status === 'scheduled' || l.status === 'completed')
    .reduce((sum, l) => sum + l.duration_minutes, 0) / 60
  const weekSessionCount = sessions.filter(s => s.status === 'scheduled' || s.status === 'completed').length

  // Navigation
  function goToPrevWeek() {
    setWeekStart(prev => addDays(prev, -7))
  }
  function goToNextWeek() {
    setWeekStart(prev => addDays(prev, 7))
  }
  function goToThisWeek() {
    setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
  }

  // Position helpers
  function getPosition(item: { scheduled_at: string; duration_minutes: number }) {
    const start = new Date(item.scheduled_at)
    const startMins = start.getHours() * 60 + start.getMinutes()
    const top = (startMins - START_HOUR * 60) * PX_PER_MIN
    const height = Math.max(item.duration_minutes * PX_PER_MIN, 28)
    return { top, height }
  }

  // Build buffer blocks between consecutive lessons
  function getBufferBlocks(dayLessons: LessonWithRelations[]) {
    if (bufferMinutes <= 0) return []
    const scheduled = dayLessons.filter(l => l.status === 'scheduled' || l.status === 'completed')
    const blocks: { top: number; height: number }[] = []

    for (let i = 0; i < scheduled.length - 1; i++) {
      const current = scheduled[i]
      const next = scheduled[i + 1]
      const currentEnd = new Date(current.scheduled_at).getTime() + current.duration_minutes * 60000
      const nextStart = new Date(next.scheduled_at).getTime()
      const gapMinutes = (nextStart - currentEnd) / 60000

      if (gapMinutes > 0 && gapMinutes <= bufferMinutes * 2) {
        const bufferShow = Math.min(bufferMinutes, gapMinutes)
        const endDate = new Date(currentEnd)
        const startMins = endDate.getHours() * 60 + endDate.getMinutes()
        const top = (startMins - START_HOUR * 60) * PX_PER_MIN
        const height = bufferShow * PX_PER_MIN
        blocks.push({ top, height })
      }
    }
    return blocks
  }

  const weekLabel = `${format(weekStart, 'MMM d')} – ${format(addDays(weekStart, 6), 'MMM d, yyyy')}`

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={goToPrevWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={goToNextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToThisWeek}>
            Today
          </Button>
          <h2 className="text-sm sm:text-base font-semibold ml-1 truncate">{weekLabel}</h2>
        </div>

        {/* Week summary */}
        <div className="flex items-center gap-3 text-sm">
          <Badge variant="secondary" className="gap-1">
            <Clock className="h-3 w-3" />
            {weekLessonCount} lesson{weekLessonCount !== 1 ? 's' : ''}
          </Badge>
          <Badge variant="secondary" className="gap-1">
            {weekHours.toFixed(1)} hrs
          </Badge>
          {weekSessionCount > 0 && (
            <Badge className="gap-1 bg-purple-100 text-purple-900 hover:bg-purple-100 border border-purple-300">
              <GraduationCap className="h-3 w-3" />
              {weekSessionCount} class{weekSessionCount !== 1 ? 'es' : ''}
            </Badge>
          )}
          {bufferMinutes > 0 && (
            <Badge variant="outline" className="gap-1 text-muted-foreground">
              <Car className="h-3 w-3" />
              {bufferMinutes}m buffer
            </Badge>
          )}
        </div>
      </div>

      {/* Calendar grid */}
      <div className={`flex border rounded-lg overflow-auto bg-background shadow-sm ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
        {/* Time gutter */}
        <div className="flex-none w-14 border-r bg-muted/30">
          <div className="h-16 border-b" />
          <div className="relative" style={{ height: totalHeight }}>
            {HOURS.map(hour => (
              <div
                key={hour}
                className="absolute right-2 text-[11px] text-muted-foreground leading-none"
                style={{ top: (hour - START_HOUR) * HOUR_HEIGHT - 6 }}
              >
                {formatHour(hour)}
              </div>
            ))}
          </div>
        </div>

        {/* Day columns */}
        {days.map((day) => {
          const isToday = isSameDay(day, today)
          const dateKey = format(day, 'yyyy-MM-dd')
          const dayLessons = lessonsByDay.get(dateKey) ?? []
          const daySessions = sessionsByDay.get(dateKey) ?? []
          const dayAssignments = assignmentsByDay.get(dateKey) ?? []
          const scheduledCount = dayLessons.filter(l => l.status === 'scheduled' || l.status === 'completed').length
          const bufferBlocks = getBufferBlocks(dayLessons)

          return (
            <div key={dateKey} className="flex-1 min-w-[120px] border-r last:border-r-0">
              {/* Day header */}
              <div
                className={`h-16 border-b flex flex-col items-center justify-center px-1 ${
                  isToday ? 'bg-blue-50' : 'bg-background'
                }`}
              >
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                  {format(day, 'EEE')}
                </span>
                <span
                  className={`text-lg font-semibold leading-tight ${
                    isToday
                      ? 'text-white bg-blue-600 rounded-full w-8 h-8 flex items-center justify-center text-sm'
                      : 'text-foreground'
                  }`}
                >
                  {format(day, 'd')}
                </span>
                {scheduledCount > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    {scheduledCount} lesson{scheduledCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Time grid */}
              <div className="relative" style={{ height: totalHeight }}>
                {/* Hour lines */}
                {HOURS.map(hour => (
                  <div
                    key={hour}
                    className="absolute inset-x-0 border-t border-border/50"
                    style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}
                  />
                ))}
                {HOURS.map(hour => (
                  <div
                    key={`${hour}-half`}
                    className="absolute inset-x-0 border-t border-border/25 border-dashed"
                    style={{ top: (hour - START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                  />
                ))}

                {/* Buffer/travel blocks */}
                {bufferBlocks.map((block, i) => (
                  <div
                    key={`buffer-${i}`}
                    className="absolute left-1 right-1 rounded bg-amber-50 border border-amber-200 border-dashed flex items-center justify-center"
                    style={{ top: block.top, height: block.height }}
                  >
                    {block.height >= 20 && (
                      <span className="text-[9px] text-amber-600 font-medium flex items-center gap-0.5">
                        <Car className="h-2.5 w-2.5" />
                        Travel
                      </span>
                    )}
                  </div>
                ))}

                {/* Lesson blocks */}
                {dayLessons.map(lesson => {
                  const { top, height } = getPosition(lesson)
                  const colorClass = STATUS_COLORS[lesson.status] ?? STATUS_COLORS.scheduled
                  const start = new Date(lesson.scheduled_at)

                  return (
                    <button
                      key={lesson.id}
                      onClick={() => setSelectedLesson(selectedLesson?.id === lesson.id ? null : lesson)}
                      className={`absolute left-1 right-1 rounded border text-left px-1.5 py-0.5 text-xs overflow-hidden hover:brightness-95 transition-all ${colorClass}`}
                      style={{ top, height }}
                    >
                      <div className="font-semibold truncate leading-tight">
                        {lesson.student.user.first_name} {lesson.student.user.last_name}
                      </div>
                      {height >= 36 && (
                        <div className="truncate text-[10px] opacity-80 leading-tight">
                          {formatTime(start.getHours(), start.getMinutes())} · {lesson.duration_minutes}m
                        </div>
                      )}
                      {height >= 52 && lesson.pickup_location && (
                        <div className="truncate text-[10px] opacity-60 leading-tight flex items-center gap-0.5">
                          <MapPin className="h-2 w-2 shrink-0" />
                          {lesson.pickup_location}
                        </div>
                      )}
                    </button>
                  )
                })}

                {/* Classroom session blocks */}
                {daySessions.map(session => {
                  const { top, height } = getPosition(session)
                  const colorClass = CLASSROOM_COLORS[session.status] ?? CLASSROOM_COLORS.scheduled
                  const start = new Date(session.scheduled_at)
                  const enrolled = session.attendance?.length ?? 0

                  return (
                    <button
                      key={session.id}
                      onClick={() => setSelectedSession(selectedSession?.id === session.id ? null : session)}
                      className={`absolute left-1 right-1 rounded border text-left px-1.5 py-0.5 text-xs overflow-hidden hover:brightness-95 transition-all ${colorClass}`}
                      style={{ top, height }}
                    >
                      <div className="font-semibold truncate leading-tight flex items-center gap-0.5">
                        <GraduationCap className="h-2.5 w-2.5 shrink-0" />
                        {session.topic}
                      </div>
                      {height >= 36 && (
                        <div className="truncate text-[10px] opacity-80 leading-tight">
                          {formatTime(start.getHours(), start.getMinutes())} · {session.duration_minutes}m
                        </div>
                      )}
                      {height >= 52 && (
                        <div className="truncate text-[10px] opacity-60 leading-tight flex items-center gap-0.5">
                          <Users className="h-2 w-2 shrink-0" />
                          {enrolled}/{session.capacity}
                        </div>
                      )}
                    </button>
                  )
                })}

                {/* Assignment blocks */}
                {dayAssignments.map(a => {
                  const { top, height } = getPosition(a)
                  const colorClass = ASSIGNMENT_COLORS[a.status] ?? ASSIGNMENT_COLORS.scheduled
                  const start = new Date(a.scheduled_at)
                  return (
                    <div
                      key={a.id}
                      title={`${a.detail || 'Assignment'} · ${a.duration_minutes}m · ${a.status}`}
                      className={`absolute left-1 right-1 rounded border text-left px-1.5 py-0.5 text-xs overflow-hidden pointer-events-none ${colorClass}`}
                      style={{ top, height, zIndex: 4 }}
                    >
                      <div className="font-semibold truncate leading-tight flex items-center gap-0.5">
                        <ClipboardList className="h-2.5 w-2.5 shrink-0" />
                        {a.detail || 'Assignment'}
                      </div>
                      {height >= 36 && (
                        <div className="truncate text-[10px] opacity-80 leading-tight">
                          {formatTime(start.getHours(), start.getMinutes())} · {a.duration_minutes}m
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Current time line */}
                {isToday && (() => {
                  const nowMins = today.getHours() * 60 + today.getMinutes()
                  const lineTop = (nowMins - START_HOUR * 60) * PX_PER_MIN
                  if (lineTop < 0 || lineTop > totalHeight) return null
                  return (
                    <div
                      className="absolute inset-x-0 border-t-2 border-red-500 z-10 pointer-events-none"
                      style={{ top: lineTop }}
                    >
                      <div className="absolute -left-1 -top-1.5 w-3 h-3 rounded-full bg-red-500" />
                    </div>
                  )
                })()}
              </div>
            </div>
          )
        })}
      </div>

      {/* Lesson detail panel */}
      {selectedLesson && (
        <LessonDetailPanel
          lesson={selectedLesson}
          bufferMinutes={bufferMinutes}
          onClose={() => setSelectedLesson(null)}
        />
      )}

      {/* Classroom session detail panel */}
      {selectedSession && (
        <ClassroomDetailPanel
          session={selectedSession}
          onClose={() => setSelectedSession(null)}
        />
      )}
    </div>
  )
}

// ── Lesson detail panel ─────────────────────────────────────
function LessonDetailPanel({
  lesson,
  bufferMinutes,
  onClose,
}: {
  lesson: LessonWithRelations
  bufferMinutes: number
  onClose: () => void
}) {
  const start = new Date(lesson.scheduled_at)
  const end = new Date(start.getTime() + lesson.duration_minutes * 60000)
  const hasNotes = lesson.notes_covered || lesson.notes_practice || lesson.notes_additional

  return (
    <div className="border rounded-lg p-4 bg-background shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">
            {lesson.student.user.first_name} {lesson.student.user.last_name}
          </p>
          <p className="text-sm text-muted-foreground">
            {format(start, 'EEEE, MMMM d')} · {format(start, 'h:mm a')} – {format(end, 'h:mm a')}
            <span className="mx-1">·</span>{lesson.duration_minutes} min
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={
            lesson.status === 'scheduled' ? 'default' :
            lesson.status === 'completed' ? 'secondary' :
            lesson.status === 'cancelled' ? 'outline' : 'destructive'
          }>
            {lesson.status.replace('_', ' ')}
          </Badge>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 px-2 text-xs">
            Close
          </Button>
        </div>
      </div>

      {/* Locations */}
      {(lesson.pickup_location || lesson.dropoff_location) && (
        <div className="flex flex-col sm:flex-row gap-2 text-sm">
          {lesson.pickup_location && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lesson.pickup_location)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-primary hover:underline"
            >
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Pickup: {lesson.pickup_location}</span>
            </a>
          )}
          {lesson.dropoff_location && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lesson.dropoff_location)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-primary hover:underline"
            >
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Dropoff: {lesson.dropoff_location}</span>
            </a>
          )}
        </div>
      )}

      {/* Buffer info */}
      {bufferMinutes > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-amber-600">
          <Car className="h-3.5 w-3.5" />
          {bufferMinutes} min travel buffer after this lesson
        </div>
      )}

      {/* Notes */}
      {hasNotes && (
        <div className="text-xs text-muted-foreground space-y-0.5 pt-2 border-t">
          {lesson.notes_covered && <p><span className="font-medium">Covered:</span> {lesson.notes_covered}</p>}
          {lesson.notes_practice && <p><span className="font-medium">Practice:</span> {lesson.notes_practice}</p>}
          {lesson.notes_additional && <p><span className="font-medium">Notes:</span> {lesson.notes_additional}</p>}
        </div>
      )}
    </div>
  )
}

// ── Classroom session detail panel ──────────────────────────
function ClassroomDetailPanel({
  session,
  onClose,
}: {
  session: ClassroomSessionWithRelations
  onClose: () => void
}) {
  const start = new Date(session.scheduled_at)
  const end = new Date(start.getTime() + session.duration_minutes * 60000)
  const enrolled = session.attendance ?? []

  return (
    <div className="border rounded-lg p-4 bg-background shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold flex items-center gap-1.5">
            <GraduationCap className="h-4 w-4 text-purple-600" />
            {session.topic}
          </p>
          <p className="text-sm text-muted-foreground">
            {format(start, 'EEEE, MMMM d')} · {format(start, 'h:mm a')} – {format(end, 'h:mm a')}
            <span className="mx-1">·</span>{session.duration_minutes} min
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={
            session.status === 'scheduled' ? 'default' :
            session.status === 'completed' ? 'secondary' : 'outline'
          }>
            {session.status}
          </Badge>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 px-2 text-xs">
            Close
          </Button>
        </div>
      </div>

      {/* Location + capacity */}
      <div className="flex flex-col sm:flex-row gap-2 text-sm">
        {session.location && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(session.location)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-primary hover:underline"
          >
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{session.location}</span>
          </a>
        )}
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Users className="h-3.5 w-3.5 shrink-0" />
          {enrolled.length}/{session.capacity} enrolled
        </span>
      </div>

      {/* Enrolled students */}
      {enrolled.length > 0 && (
        <div className="text-xs text-muted-foreground space-y-0.5 pt-2 border-t">
          {enrolled.map(a => (
            <p key={a.id} className="truncate">
              {a.student.user.first_name} {a.student.user.last_name}
            </p>
          ))}
        </div>
      )}

      {/* Notes */}
      {session.notes && (
        <div className="text-xs text-muted-foreground pt-2 border-t">
          <span className="font-medium">Notes:</span> {session.notes}
        </div>
      )}
    </div>
  )
}
