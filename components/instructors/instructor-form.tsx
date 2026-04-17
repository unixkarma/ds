'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { InstructorWithUser } from '@/types'

// All fields typed as string to avoid z.coerce type conflicts with react-hook-form.
// Numbers are converted in onSubmit.
const instructorFormSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string(),
  password: z.string(),
  phone: z.string(),
  licenseNumber: z.string(),
  maxLessonsPerDay: z.string(),
  modality: z.string(),
  commissionRate: z.string(),
  hourlyRateCents: z.string(),
  lessonPriceCents: z.string(),
  usesSchoolVehicle: z.boolean(),
  vehicleMonthlyFeeCents: z.string(),
  serviceArea: z.string(),
  bufferMinutes: z.string(),
})

type InstructorFormValues = z.infer<typeof instructorFormSchema>

interface InstructorFormProps {
  instructor?: InstructorWithUser
  schoolBasePriceCents?: number
}

export function InstructorForm({ instructor, schoolBasePriceCents = 0 }: InstructorFormProps) {
  const router = useRouter()
  const isEdit = !!instructor
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const form = useForm<InstructorFormValues>({
    resolver: zodResolver(instructorFormSchema),
    defaultValues: {
      firstName: instructor?.user.first_name ?? '',
      lastName: instructor?.user.last_name ?? '',
      email: '',
      password: '',
      phone: instructor?.user.phone ?? '',
      licenseNumber: instructor?.license_number ?? '',
      maxLessonsPerDay: String(instructor?.max_lessons_per_day ?? 6),
      modality: instructor?.modality ?? 'school',
      commissionRate: String((instructor?.commission_rate ?? 0.10) * 100),
      hourlyRateCents: String((instructor?.hourly_rate_cents ?? 0) / 100),
      lessonPriceCents: instructor?.lesson_price_cents
        ? String(instructor.lesson_price_cents / 100)
        : '',
      usesSchoolVehicle: instructor?.uses_school_vehicle ?? false,
      vehicleMonthlyFeeCents: String((instructor?.vehicle_monthly_fee_cents ?? 27200) / 100),
      serviceArea: instructor?.service_area ?? '',
      bufferMinutes: String(instructor?.buffer_minutes ?? 0),
    },
  })

  const modality = form.watch('modality')
  const usesVehicle = form.watch('usesSchoolVehicle')
  const floorPrice = schoolBasePriceCents > 0
    ? (schoolBasePriceCents * 0.8 / 100).toFixed(2)
    : null

  async function onSubmit(values: InstructorFormValues) {
    if (!isEdit) {
      if (!values.email.trim()) {
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

    // Validate lesson price floor for independent instructors
    if (values.modality === 'independent' && values.lessonPriceCents && schoolBasePriceCents > 0) {
      const priceCents = Math.round(parseFloat(values.lessonPriceCents) * 100)
      const floor = Math.round(schoolBasePriceCents * 0.8)
      if (priceCents < floor) {
        form.setError('lessonPriceCents', {
          message: `Minimum price is $${(floor / 100).toFixed(2)} (80% of base price)`,
        })
        return
      }
    }

    setIsLoading(true)
    setError(null)

    const contractorFields = {
      modality: values.modality,
      commissionRate: parseFloat(values.commissionRate) / 100 || 0.10,
      hourlyRateCents: Math.round(parseFloat(values.hourlyRateCents) * 100) || 0,
      lessonPriceCents: values.lessonPriceCents
        ? Math.round(parseFloat(values.lessonPriceCents) * 100)
        : null,
      usesSchoolVehicle: values.usesSchoolVehicle,
      vehicleMonthlyFeeCents: values.usesSchoolVehicle
        ? Math.round(parseFloat(values.vehicleMonthlyFeeCents) * 100) || 27200
        : 0,
    }

    try {
      let response: Response

      if (isEdit) {
        response = await fetch(`/api/instructors/${instructor!.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName: values.firstName,
            lastName: values.lastName,
            phone: values.phone,
            licenseNumber: values.licenseNumber,
            maxLessonsPerDay: parseInt(values.maxLessonsPerDay, 10) || 6,
            serviceArea: values.serviceArea,
            bufferMinutes: parseInt(values.bufferMinutes, 10) || 0,
            ...contractorFields,
          }),
        })
      } else {
        response = await fetch('/api/instructors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName: values.firstName,
            lastName: values.lastName,
            email: values.email,
            password: values.password,
            phone: values.phone,
            licenseNumber: values.licenseNumber,
            maxLessonsPerDay: parseInt(values.maxLessonsPerDay, 10) || 6,
            serviceArea: values.serviceArea,
            bufferMinutes: parseInt(values.bufferMinutes, 10) || 0,
            ...contractorFields,
          }),
        })
      }

      if (!response.ok) {
        const data = await response.json()
        setError(data.error ?? 'Something went wrong. Please try again.')
        return
      }

      router.push('/dashboard/instructors')
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="firstName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>First Name</FormLabel>
                <FormControl>
                  <Input placeholder="Carlos" {...field} />
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
                  <Input placeholder="Smith" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {!isEdit && (
          <>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="instructor@example.com" autoComplete="off" {...field} />
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
                    Share this password with the instructor so they can log in.
                  </p>
                </FormItem>
              )}
            />
          </>
        )}

        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
              <FormControl>
                <Input type="tel" placeholder="+1 555 000 0000" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="licenseNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>License Number <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                <FormControl>
                  <Input placeholder="DL-12345" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="maxLessonsPerDay"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Max Lessons / Day</FormLabel>
                <FormControl>
                  <Input type="number" min={1} max={20} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="bufferMinutes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Buffer Between Lessons <span className="text-muted-foreground font-normal">(minutes)</span></FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="0">No buffer</SelectItem>
                  <SelectItem value="5">5 min</SelectItem>
                  <SelectItem value="10">10 min</SelectItem>
                  <SelectItem value="15">15 min</SelectItem>
                  <SelectItem value="20">20 min</SelectItem>
                  <SelectItem value="30">30 min</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                Travel time between lesson locations. Available slots will be spaced accordingly.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="serviceArea"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Service Area <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
              <FormControl>
                <Textarea
                  rows={2}
                  placeholder="e.g. North Side Chicago, Lincoln Park, 60614, 60657"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Neighborhoods, cities, or zip codes where this instructor provides lessons.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* ── Contractor Settings ────────────────���──────────────── */}
        <div className="border-t pt-5 mt-5">
          <h3 className="text-sm font-semibold mb-4">Contractor Settings</h3>

          <div className="space-y-5">
            <FormField
              control={form.control}
              name="modality"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Modality</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="school">School Sale — school brings the student</SelectItem>
                      <SelectItem value="independent">Independent — instructor brings their own students</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {modality === 'school' ? (
              <FormField
                control={form.control}
                name="hourlyRateCents"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hourly Rate ($)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min={0} placeholder="30.00" {...field} />
                    </FormControl>
                    <FormDescription>
                      What the instructor earns per hour when the school sells the lesson.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <>
                <FormField
                  control={form.control}
                  name="lessonPriceCents"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lesson Price ($)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min={0} placeholder="65.00" {...field} />
                      </FormControl>
                      <FormDescription>
                        Price per hour the instructor charges.
                        {floorPrice && ` Minimum: $${floorPrice} (80% of base price).`}
                        {' '}Leave empty to use the school default.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="commissionRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Commission (%)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.1" min={0} max={100} placeholder="10" {...field} />
                      </FormControl>
                      <FormDescription>
                        Percentage the school keeps from independent sales.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}

            <div className="space-y-4">
              <FormField
                control={form.control}
                name="usesSchoolVehicle"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-3">
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <div className="space-y-0.5">
                      <FormLabel className="cursor-pointer">Uses School Vehicle</FormLabel>
                      <FormDescription>
                        Monthly fee will be deducted from earnings.
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              {usesVehicle && (
                <FormField
                  control={form.control}
                  name="vehicleMonthlyFeeCents"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vehicle Monthly Fee ($)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min={0} placeholder="272.00" {...field} />
                      </FormControl>
                      <FormDescription>
                        Monthly deduction for commercial vehicle insurance.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Add Instructor'}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={isLoading}>
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  )
}
