'use client'

import { getFullName } from '@/lib/utils'
import type { LessonWithRelations, InstructorWithUser } from '@/types'

const HOUR_HEIGHT = 80
const START_HOUR = 7
const END_HOUR = 21
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

interface MultiInstructorViewProps {
  lessons: LessonWithRelations[]
  instructors: InstructorWithUser[]
  selectedDate: Date
  onLessonClick: (lesson: LessonWithRelations) => void
}

export function MultiInstructorView({
  lessons,
  instructors,
  selectedDate,
  onLessonClick,
}: MultiInstructorViewProps) {
  const activeInstructors = instructors.filter((i) => i.is_active)

  function getLessonsForInstructor(instructorId: string): LessonWithRelations[] {
    return lessons.filter((l) => {
      const ld = new Date(l.scheduled_at)
      return (
        l.instructor_id === instructorId &&
        ld.getFullYear() === selectedDate.getFullYear() &&
        ld.getMonth() === selectedDate.getMonth() &&
        ld.getDate() === selectedDate.getDate()
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
        <div className="h-14 border-b" />
        <div className="relative" style={{ height: totalHeight }}>
          {HOURS.map((hour) => (
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

      {/* Instructor columns */}
      {activeInstructors.map((inst) => (
        <div key={inst.id} className="flex-1 min-w-[140px] border-r last:border-r-0">
          {/* Instructor header */}
          <div className="h-14 border-b flex flex-col items-center justify-center bg-background px-1">
            <span className="text-xs font-semibold truncate max-w-full">
              {getFullName(inst.user)}
            </span>
            <span className="text-[10px] text-muted-foreground truncate max-w-full">
              {inst.modality === 'independent' ? 'Independent' : 'School'}
            </span>
          </div>

          {/* Time grid */}
          <div className="relative" style={{ height: totalHeight }}>
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute inset-x-0 border-t border-border/50"
                style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}
              />
            ))}
            {HOURS.map((hour) => (
              <div
                key={`${hour}-half`}
                className="absolute inset-x-0 border-t border-border/25 border-dashed"
                style={{ top: (hour - START_HOUR) * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
              />
            ))}

            {getLessonsForInstructor(inst.id).map((lesson) => {
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
                      {lesson.duration_minutes} min · {lesson.status}
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
          </div>
        </div>
      ))}

      {activeInstructors.length === 0 && (
        <div className="flex-1 flex items-center justify-center p-12 text-sm text-muted-foreground">
          No active instructors.
        </div>
      )}
    </div>
  )
}
