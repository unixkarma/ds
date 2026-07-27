import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO, differenceInYears } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Format a date string or Date object for display
export function formatDate(date: string | Date, fmt = 'MMM d, yyyy'): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, fmt)
}

// Format a datetime string for display
export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'MMM d, yyyy h:mm a')
}

// Age in whole years as of today, from a date of birth
export function calculateAge(dateOfBirth: string | Date): number {
  const d = typeof dateOfBirth === 'string' ? parseISO(dateOfBirth) : dateOfBirth
  return differenceInYears(new Date(), d)
}

// Format cents to a display currency string
export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}

// Return the full display name for a user
export function getFullName(user: { first_name: string; last_name: string }): string {
  return `${user.first_name} ${user.last_name}`.trim()
}

// Initials for an avatar fallback
export function getInitials(user: { first_name: string; last_name: string }): string {
  return `${user.first_name[0] ?? ''}${user.last_name[0] ?? ''}`.toUpperCase()
}

// Convert a duration in minutes to a display string in hours (e.g. 90 → "1.5 h", 60 → "1 h")
export function formatHours(durationMin: number): string {
  const hours = Math.round((durationMin / 60) * 100) / 100
  return `${hours} h`
}

// Map day_of_week integer to label
export const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Convert HH:MM:SS time string to 12-hour display (e.g. "09:00:00" → "9:00 AM")
export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')} ${period}`
}

// Format a time slot as "9:00 AM – 10:00 AM" given a start (HH:MM) and duration in minutes.
export function formatTimeRange(start: string, durationMin: number): string {
  const [h, m] = start.split(':').map(Number)
  const totalEnd = h * 60 + m + durationMin
  const endH = Math.floor(totalEnd / 60) % 24
  const endM = totalEnd % 60
  const endStr = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
  return `${formatTime(start)} – ${formatTime(endStr)}`
}
