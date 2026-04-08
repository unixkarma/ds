// GET /api/instructors/[id]/available-slots?date=YYYY-MM-DD
// Returns open 1-hour time slots for the given instructor on the given date.
// Logic: look up the instructor's weekly availability for that day_of_week,
// then subtract any already-booked lessons to produce the open slots.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface TimeSlot {
  start: string // HH:MM
  end: string   // HH:MM
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: instructorId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const dateStr = searchParams.get('date')

  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NextResponse.json({ error: 'date query param required (YYYY-MM-DD)' }, { status: 400 })
  }

  // Determine day_of_week for the requested date (0=Sunday, 6=Saturday)
  const requestedDate = new Date(dateStr + 'T00:00:00')
  const dayOfWeek = requestedDate.getDay()

  // Fetch instructor's availability for that day
  const { data: availability } = await supabase
    .from('availability')
    .select('start_time, end_time')
    .eq('instructor_id', instructorId)
    .eq('day_of_week', dayOfWeek)

  if (!availability || availability.length === 0) {
    return NextResponse.json({ slots: [] })
  }

  // Fetch booked lessons for this instructor on this date
  const dayStart = new Date(dateStr + 'T00:00:00').toISOString()
  const dayEnd = new Date(dateStr + 'T23:59:59').toISOString()

  const { data: bookedLessons } = await supabase
    .from('lessons')
    .select('scheduled_at, duration_minutes')
    .eq('instructor_id', instructorId)
    .eq('status', 'scheduled')
    .gte('scheduled_at', dayStart)
    .lte('scheduled_at', dayEnd)

  // Convert booked lessons to time ranges
  const bookedRanges = (bookedLessons ?? []).map(lesson => {
    const start = new Date(lesson.scheduled_at)
    const end = new Date(start.getTime() + lesson.duration_minutes * 60 * 1000)
    return {
      startMinutes: start.getHours() * 60 + start.getMinutes(),
      endMinutes: end.getHours() * 60 + end.getMinutes(),
    }
  })

  // Generate 1-hour slots from availability windows, excluding booked ones
  const slotDuration = 60 // minutes
  const openSlots: TimeSlot[] = []

  for (const avail of availability) {
    const [startH, startM] = avail.start_time.split(':').map(Number)
    const [endH, endM] = avail.end_time.split(':').map(Number)
    const availStart = startH * 60 + startM
    const availEnd = endH * 60 + endM

    for (let slotStart = availStart; slotStart + slotDuration <= availEnd; slotStart += slotDuration) {
      const slotEnd = slotStart + slotDuration

      // Check if this slot overlaps with any booked lesson
      const isBooked = bookedRanges.some(
        booked => booked.startMinutes < slotEnd && booked.endMinutes > slotStart
      )

      if (!isBooked) {
        const startStr = `${String(Math.floor(slotStart / 60)).padStart(2, '0')}:${String(slotStart % 60).padStart(2, '0')}`
        const endStr = `${String(Math.floor(slotEnd / 60)).padStart(2, '0')}:${String(slotEnd % 60).padStart(2, '0')}`
        openSlots.push({ start: startStr, end: endStr })
      }
    }
  }

  return NextResponse.json({ slots: openSlots })
}
