'use client'

import { getFullName } from '@/lib/utils'
import type { LessonWithRelations, InstructorWithUser, Opening, InstructorAssignmentWithInstructor } from '@/types'

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

interface MultiInstructorViewProps {
  lessons: LessonWithRelations[]
  openings?: Opening[]
  assignments?: InstructorAssignmentWithInstructor[]
  instructors: InstructorWithUser[]
  selectedDate: Date
  onLessonClick: (lesson: LessonWithRelations) => void
}

export function MultiInstructorView({
  lessons,
  openings = [],
  assignments = [],
  instructors,
  selectedDate,
  onLessonClick,
}: MultiInstructorViewProps) {
  const activeInstructors = instructors.filter((i) => i.is_active)

  function isOnSelectedDay(iso: string): boolean {
    const ld = new Date(iso)
    return (
      ld.getFullYear() === selectedDate.getFullYear() &&
      ld.getMonth() === selectedDate.getMonth() &&
      ld.getDate() === selectedDate.getDate()
    )
  }

  function getLessonsForInstructor(instructorId: string): LessonWithRelations[] {
    return lessons.filter(
      (l) => l.instructor_id === instructorId && isOnSelectedDay(l.scheduled_at)
    )
  }

  function getOpeningsForInstructor(instructorId: string): Opening[] {
    return openings.filter(
      (o) => o.instructor_id === instructorId && isOnSelectedDay(o.scheduled_at)
    )
  }

  function getAssignmentsForInstructor(instructorId: string): InstructorAssignmentWithInstructor[] {
    return assignments.filter(
      (a) => a.instructor_id === instructorId && isOnSelectedDay(a.scheduled_at)
    )
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

            {/* Openings — render BEHIND lessons */}
            {getOpeningsForInstructor(inst.id).map((o) => {
              const { top, height } = getPosition(o.scheduled_at, o.duration_minutes)
              const colorClass = OPENING_COLORS[o.status] ?? OPENING_COLORS.available
              const label = o.status === 'blocked' ? 'Blocked' : 'Open'
              return (
                <div
                  key={`o-${o.id}`}
                  title={`${label} · ${o.duration_minutes} min`}
                  className={`absolute left-1 right-1 rounded border-2 text-left px-1.5 py-1 text-[10px] overflow-hidden pointer-events-none ${colorClass}`}
                  style={{ top, height, zIndex: 1 }}
                >
                  <div className="font-medium truncate leading-tight">{label}</div>
                  {height >= 32 && (
                    <div className="truncate opacity-70 leading-tight">{o.duration_minutes} min</div>
                  )}
                </div>
              )
            })}

            {getLessonsForInstructor(inst.id).map((lesson) => {
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

            {/* Assignments — distinct amber blocks */}
            {getAssignmentsForInstructor(inst.id).map((a) => {
              const { top, height } = getPosition(a.scheduled_at, a.duration_minutes)
              const colorClass = ASSIGNMENT_COLORS[a.status] ?? ASSIGNMENT_COLORS.scheduled
              return (
                <div
                  key={`a-${a.id}`}
                  title={`${a.detail || 'Assignment'} · ${a.duration_minutes} min · ${a.status}`}
                  className={`absolute left-1 right-1 rounded border text-left px-1.5 py-1 text-[10px] overflow-hidden pointer-events-none ${colorClass}`}
                  style={{ top, height, zIndex: 3 }}
                >
                  <div className="font-semibold truncate leading-tight">📋 {a.detail || 'Assignment'}</div>
                  {height >= 32 && (
                    <div className="truncate opacity-75 leading-tight">{a.duration_minutes} min</div>
                  )}
                </div>
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
