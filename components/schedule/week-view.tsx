'use client'

import type { LessonWithRelations, Opening, InstructorWithUser, InstructorAssignmentWithInstructor } from '@/types'

const HOUR_HEIGHT = 80 // px per hour
const START_HOUR = 7   // 7:00 AM
const END_HOUR = 21    // 9:00 PM
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)
const PX_PER_MIN = HOUR_HEIGHT / 60

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 border-blue-400 text-blue-900',
  completed: 'bg-emerald-100 border-emerald-400 text-emerald-900',
  cancelled: 'bg-gray-100 border-gray-300 text-gray-400',
  no_show: 'bg-red-100 border-red-400 text-red-900',
}

// Openings render as backgrounds behind lessons. Visually subordinate so they
// don't compete with real bookings.
const OPENING_COLORS: Record<string, string> = {
  available: 'bg-emerald-50/60 border-emerald-300 border-dashed text-emerald-700',
  blocked: 'bg-zinc-100/60 border-zinc-300 border-dashed text-zinc-500',
}

// Assignments get a distinct (amber) palette so they stand apart from lessons.
const ASSIGNMENT_COLORS: Record<string, string> = {
  scheduled: 'bg-amber-100 border-amber-400 text-amber-900',
  completed: 'bg-amber-200 border-amber-500 text-amber-900',
  cancelled: 'bg-gray-100 border-gray-300 text-gray-400',
}

function formatHour(hour: number): string {
  if (hour === 12) return '12 PM'
  if (hour > 12) return `${hour - 12} PM`
  return `${hour} AM`
}

interface WeekViewProps {
  lessons: LessonWithRelations[]
  openings?: Opening[]
  assignments?: InstructorAssignmentWithInstructor[]
  weekStart: Date // Monday of the displayed week
  onLessonClick: (lesson: LessonWithRelations) => void
  instructors?: InstructorWithUser[] // optional, used to label openings with instructor name
}

export function WeekView({ lessons, openings = [], assignments = [], weekStart, onLessonClick, instructors = [] }: WeekViewProps) {
  const instructorById = new Map(instructors.map(i => [i.id, i]))
  // Build Mon–Sun array for this week
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  const today = new Date()

  function isSameDay(iso: string, day: Date): boolean {
    const d = new Date(iso)
    return (
      d.getFullYear() === day.getFullYear() &&
      d.getMonth() === day.getMonth() &&
      d.getDate() === day.getDate()
    )
  }

  function getLessonsForDay(day: Date): LessonWithRelations[] {
    return lessons.filter(l => isSameDay(l.scheduled_at, day))
  }

  function getOpeningsForDay(day: Date): Opening[] {
    return openings.filter(o => isSameDay(o.scheduled_at, day))
  }

  function getAssignmentsForDay(day: Date): InstructorAssignmentWithInstructor[] {
    return assignments.filter(a => isSameDay(a.scheduled_at, day))
  }

  function getPosition(scheduled_at: string, duration_minutes: number) {
    const start = new Date(scheduled_at)
    const startMins = start.getHours() * 60 + start.getMinutes()
    const top = (startMins - START_HOUR * 60) * PX_PER_MIN
    const height = Math.max(duration_minutes * PX_PER_MIN, 24)
    return { top, height }
  }

  const totalHeight = HOURS.length * HOUR_HEIGHT

  return (
    <div className="flex border rounded-lg overflow-auto bg-background shadow-sm">
      {/* Time gutter */}
      <div className="flex-none w-14 border-r bg-muted/30">
        {/* Header spacer matching day header height */}
        <div className="h-14 border-b" />
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
      {days.map((day, dayIdx) => {
        const isToday =
          day.getFullYear() === today.getFullYear() &&
          day.getMonth() === today.getMonth() &&
          day.getDate() === today.getDate()

        return (
          <div key={dayIdx} className="flex-1 min-w-[110px] border-r last:border-r-0">
            {/* Day header */}
            <div
              className={`h-14 border-b flex flex-col items-center justify-center sticky top-0 z-10 ${
                isToday ? 'bg-blue-50' : 'bg-background'
              }`}
            >
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                {day.toLocaleDateString('en-US', { weekday: 'short' })}
              </span>
              <span
                className={`text-lg font-semibold leading-tight ${
                  isToday
                    ? 'text-white bg-blue-600 rounded-full w-8 h-8 flex items-center justify-center text-sm'
                    : 'text-foreground'
                }`}
              >
                {day.getDate()}
              </span>
            </div>

            {/* Time grid */}
            <div className="relative" style={{ height: totalHeight }}>
              {/* Hour dividers */}
              {HOURS.map(hour => (
                <div
                  key={hour}
                  className="absolute inset-x-0 border-t border-border/50"
                  style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}
                />
              ))}
              {/* Half-hour dividers */}
              {HOURS.map(hour => (
                <div
                  key={`${hour}-half`}
                  className="absolute inset-x-0 border-t border-border/25 border-dashed"
                  style={{ top: (hour - START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                />
              ))}

              {/* Openings (rendered first → they sit BEHIND lessons z-wise) */}
              {getOpeningsForDay(day).map(o => {
                const { top, height } = getPosition(o.scheduled_at, o.duration_minutes)
                const colorClass = OPENING_COLORS[o.status] ?? OPENING_COLORS.available
                const inst = instructorById.get(o.instructor_id)
                const label = o.status === 'blocked' ? 'Blocked' : 'Open'
                return (
                  <div
                    key={`o-${o.id}`}
                    title={inst ? `${label} · ${inst.user.first_name} ${inst.user.last_name}` : label}
                    className={`absolute left-1 right-1 rounded border-2 text-left px-1.5 py-1 text-[10px] overflow-hidden pointer-events-none ${colorClass}`}
                    style={{ top, height, zIndex: 1 }}
                  >
                    <div className="font-medium truncate leading-tight">{label}</div>
                    {inst && height >= 32 && (
                      <div className="truncate opacity-70 leading-tight">
                        {inst.user.first_name} {inst.user.last_name}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Lessons */}
              {getLessonsForDay(day).map(lesson => {
                const { top, height } = getPosition(lesson.scheduled_at, lesson.duration_minutes)
                const colorClass = STATUS_COLORS[lesson.status] ?? STATUS_COLORS.scheduled

                return (
                  <button
                    key={lesson.id}
                    onClick={() => onLessonClick(lesson)}
                    className={`absolute left-1 right-1 rounded border text-left px-1.5 py-1 text-xs overflow-hidden hover:brightness-95 transition-all ${colorClass}`}
                    style={{ top, height, zIndex: 2 }}
                  >
                    <div className="font-semibold truncate leading-tight">
                      {lesson.student.user.first_name} {lesson.student.user.last_name}
                    </div>
                    {height >= 40 && (
                      <div className="truncate text-[10px] opacity-75 leading-tight">
                        {lesson.instructor.user.first_name} {lesson.instructor.user.last_name}
                      </div>
                    )}
                    {height >= 56 && lesson.pickup_location && (
                      <div className="truncate text-[10px] opacity-60 leading-tight">
                        ↑ {lesson.pickup_location}
                      </div>
                    )}
                  </button>
                )
              })}

              {/* Assignments — distinct amber blocks */}
              {getAssignmentsForDay(day).map(a => {
                const { top, height } = getPosition(a.scheduled_at, a.duration_minutes)
                const colorClass = ASSIGNMENT_COLORS[a.status] ?? ASSIGNMENT_COLORS.scheduled
                const inst = instructorById.get(a.instructor_id)
                return (
                  <div
                    key={`a-${a.id}`}
                    title={`${a.detail || 'Assignment'}${inst ? ` · ${inst.user.first_name} ${inst.user.last_name}` : ''} · ${a.duration_minutes} min · ${a.status}`}
                    className={`absolute left-1 right-1 rounded border text-left px-1.5 py-1 text-[10px] overflow-hidden pointer-events-none ${colorClass}`}
                    style={{ top, height, zIndex: 3 }}
                  >
                    <div className="font-semibold truncate leading-tight">📋 {a.detail || 'Assignment'}</div>
                    {inst && height >= 32 && (
                      <div className="truncate opacity-75 leading-tight">
                        {inst.user.first_name} {inst.user.last_name}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
