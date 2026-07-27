"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { format, parseISO } from "date-fns"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

interface DatePickerProps {
  value: string // "yyyy-MM-dd", empty string = unset
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  id?: string
  name?: string
}

// Wraps the shadcn Calendar in a button that always renders the unambiguous
// "MMM d, yyyy" format (e.g. "Jul 3, 2026") — never a locale-dependent
// numeric format that could be misread as DD/MM instead of MM/DD.
export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  disabled,
  id,
  name,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const selected = value ? parseISO(value) : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          name={name}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !selected && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {selected ? format(selected, "MMM d, yyyy") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            if (date) onChange(format(date, "yyyy-MM-dd"))
            setOpen(false)
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}
