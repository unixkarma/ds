'use client'

import type { LessonWithRelations } from '@/types'

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

function formatHour(hour: number): string {
  if (hour === 12) return '12 PM'
  if (hour > 12) return `${hour - 12} PM`
  return `${hour} AM`
}

interface WeekViewProps {
  lessons: LessonWithRelations[]
  weekStart: Date // Monday of the displayed week
  onLessonClick: (lesson: LessonWithRelations) => void
}

export function WeekView({ lessons, weekStart, onLessonClick }: WeekViewProps) {
  // Build Mon–Sun array for this week
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  const today = new Date()

  function getLessonsForDay(day: Date): LessonWithRelations[] {
    return lessons.filter(l => {
      const ld = new Date(l.scheduled_at)
      return (
        ld.getFullYear() === day.getFullYear() &&
        ld.getMonth() === day.getMonth() &&
        ld.getDate() === day.getDate()
      )
    })
  }

  function getLessonPosition(lesson: LessonWithRelations) {
    const start = new Date(lesson.scheduled_at)
    const startMins = start.getHours() * 60 + start.getMinutes()
    const top = (startMins - START_HOUR * 60) * PX_PER_MIN
    const height = Math.max(lesson.duration_minutes * PX_PER_MIN, 24)
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

              {/* Lessons */}
              {getLessonsForDay(day).map(lesson => {
                const { top, height } = getLessonPosition(lesson)
                const colorClass = STATUS_COLORS[lesson.status] ?? STATUS_COLORS.scheduled

                return (
                  <button
                    key={lesson.id}
                    onClick={() => onLessonClick(lesson)}
                    className={`absolute left-1 right-1 rounded border text-left px-1.5 py-1 text-xs overflow-hidden hover:brightness-95 transition-all ${colorClass}`}
                    style={{ top, height }}
                  >
                    <div className="font-semibold truncate leading-tight">
                      {lesson.student.user.first_name} {lesson.student.user.last_name}
                    </div>
                    {height >= 40 && (
                      <div className="truncate text-[10px] opacity-75 leading-tight">
                        {lesson.instructor.user.first_name} {lesson.instructor.user.last_name}
                      </div>
                    )}
                    {height >= 56 && (
                      <div className="truncate text-[10px] opacity-60 leading-tight">
                        {lesson.duration_minutes} min
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
