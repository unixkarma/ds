'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { StudentWithUser } from '@/types'

// ── Single schema for both create and edit ────────────────────
// All fields are strings (empty string = not provided).
// Email validation for create mode is handled manually in onSubmit.
const studentFormSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string(),
  password: z.string(),
  phone: z.string().min(1, 'Phone is required'),
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  ageGroup: z.enum(['teen', 'adult']),
  notes: z.string(),
  parent1Name: z.string(),
  parent1Phone: z.string(),
  parent1Email: z.string(),
  parent2Name: z.string(),
  parent2Phone: z.string(),
  parent2Email: z.string(),
})

type StudentFormValues = z.infer<typeof studentFormSchema>

// ── Props ─────────────────────────────────────────────────────
interface StudentFormProps {
  student?: StudentWithUser
}

// ── Component ─────────────────────────────────────────────────
export function StudentForm({ student }: StudentFormProps) {
  const router = useRouter()
  const isEdit = !!student
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Under 18 at signup = teen, 18+ = adult. Returns null for empty/invalid input.
  function ageGroupFromDob(dob: string): 'teen' | 'adult' | null {
    if (!dob) return null
    const d = new Date(dob)
    if (isNaN(d.getTime())) return null
    const today = new Date()
    let age = today.getFullYear() - d.getFullYear()
    const m = today.getMonth() - d.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--
    return age < 18 ? 'teen' : 'adult'
  }

  const initialDob = student?.user.date_of_birth ?? ''
  const initialAgeGroup =
    student?.age_group ?? ageGroupFromDob(initialDob) ?? 'adult'

  const form = useForm<StudentFormValues>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: {
      firstName: student?.user.first_name ?? '',
      lastName: student?.user.last_name ?? '',
      email: '',
      password: '',
      phone: student?.user.phone ?? '',
      dateOfBirth: initialDob,
      ageGroup: initialAgeGroup,
      notes: student?.notes ?? '',
      parent1Name: student?.parent1_name ?? '',
      parent1Phone: student?.parent1_phone ?? '',
      parent1Email: student?.parent1_email ?? '',
      parent2Name: student?.parent2_name ?? '',
      parent2Phone: student?.parent2_phone ?? '',
      parent2Email: student?.parent2_email ?? '',
    },
  })

  // Auto-select teen/adult when DOB changes. User can still override manually.
  const watchedDob = form.watch('dateOfBirth')
  // Drives the contact section: teens require a phone, adults don't.
  const isTeen = form.watch('ageGroup') === 'teen'
  useEffect(() => {
    const detected = ageGroupFromDob(watchedDob)
    if (detected && form.getValues('ageGroup') !== detected) {
      form.setValue('ageGroup', detected, { shouldDirty: true })
    }
  }, [watchedDob, form])

  async function onSubmit(values: StudentFormValues) {
    // Extra validation: email is required in create mode
    if (!isEdit) {
      if (!values.email || values.email.trim() === '') {
        form.setError('email', { message: 'Email is required' })
        return
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(values.email)) {
        form.setError('email', { message: 'Please enter a valid email address' })
        return
      }
      if (!values.password.trim() || values.password.length < 6) {
        form.setError('password', { message: 'Password must be at least 6 characters' })
        return
      }
    }

    // A parent/emergency phone is mandatory only for teens. Adults can leave
    // the contact section blank.
    if (
      values.ageGroup === 'teen' &&
      !values.parent1Phone.trim() &&
      !values.parent2Phone.trim()
    ) {
      form.setError('parent1Phone', {
        message: 'At least one parent/emergency contact phone is required for teen students',
      })
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (values.parent1Email.trim() && !emailRegex.test(values.parent1Email)) {
      form.setError('parent1Email', { message: 'Invalid email' })
      return
    }
    if (values.parent2Email.trim() && !emailRegex.test(values.parent2Email)) {
      form.setError('parent2Email', { message: 'Invalid email' })
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      let response: Response

      if (isEdit) {
        response = await fetch(`/api/students/${student!.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName: values.firstName,
            lastName: values.lastName,
            phone: values.phone || '',
            dateOfBirth: values.dateOfBirth || null,
            ageGroup: values.ageGroup,
            notes: values.notes || null,
            parent1Name: values.parent1Name,
            parent1Phone: values.parent1Phone,
            parent1Email: values.parent1Email,
            parent2Name: values.parent2Name,
            parent2Phone: values.parent2Phone,
            parent2Email: values.parent2Email,
          }),
        })
      } else {
        response = await fetch('/api/students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
        })
      }

      if (!response.ok) {
        const data = await response.json()
        setError(data.error ?? 'Something went wrong. Please try again.')
        return
      }

      router.push('/dashboard/students')
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Name row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="firstName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>First Name</FormLabel>
                <FormControl>
                  <Input placeholder="Jane" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="lastName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Last Name</FormLabel>
                <FormControl>
                  <Input placeholder="Doe" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Email — only shown in create mode */}
        {!isEdit && (
          <>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="jane@example.com"
                      autoComplete="off"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="Min 6 characters" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                  <p className="text-xs text-muted-foreground">
                    Share this password with the student so they can log in.
                  </p>
                </FormItem>
              )}
            />
          </>
        )}

        {/* Phone + DOB row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input type="tel" placeholder="+1 555 000 0000" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="dateOfBirth"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date of Birth</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Age group — controls which packages this student can access */}
        <FormField
          control={form.control}
          name="ageGroup"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Age Group</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="teen">Teen</SelectItem>
                  <SelectItem value="adult">Adult</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Auto-selected from Date of Birth (under 18 = Teen). Override if needed. Teens see only teen + universal packages.
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Parent / Emergency Contact */}
        <div className="border rounded-md p-4 space-y-4 bg-muted/30">
          <div>
            <h3 className="font-medium text-sm">
              Parent / Emergency Contact
              {!isTeen && <span className="text-muted-foreground font-normal"> (optional)</span>}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {isTeen
                ? 'For teen students, at least one parent/emergency contact phone is required.'
                : 'Optional for adult students. Add a contact if you have one on file.'}
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">Contact 1</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="parent1Name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="parent1Phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Phone{isTeen ? ' *' : ''}</FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="+1 555 000 0000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="parent1Email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="parent@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">Contact 2 (optional)</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="parent2Name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Jane Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="parent2Phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Phone</FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="+1 555 000 0000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="parent2Email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="parent@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Any notes about this student..."
                  className="resize-none"
                  rows={3}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Add Student'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={isLoading}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  )
}
