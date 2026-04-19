'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, CheckCircle2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'

// ── Validation ───────────────────────────────────────────────

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
]

const registrationSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  middleName: z.string(),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Valid email required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  phone: z.string().min(1, 'Cell phone is required'),
  address: z.string().min(1, 'Address is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  zipCode: z.string().min(1, 'Zip code is required'),
  gender: z.string().min(1, 'Gender is required'),
  dobMonth: z.string().min(1, 'Month is required'),
  dobDay: z.string().min(1, 'Day is required'),
  dobYear: z.string().min(1, 'Year is required'),
  parent1Name: z.string().min(1, 'Required'),
  parent1Phone: z.string().min(1, 'Required'),
  parent1Email: z.string(),
  parent2Name: z.string(),
  parent2Phone: z.string(),
  parent2Email: z.string(),
  emergencyContactName: z.string().min(1, 'Required'),
  emergencyContactPhone: z.string().min(1, 'Required'),
  emergencyContactRelationship: z.string().min(1, 'Required'),
  schoolReferral: z.string(),
  roadTestStatus: z.string(),
  wearsGlassesContacts: z.string().min(1, 'Required'),
  medicalConditions: z.string(),
  howHeardAboutUs: z.string().min(1, 'Required'),
  hasLearnersPermit: z.string().min(1, 'Required'),
  permitNumber: z.string(),
  permitIssuedDate: z.string(),
  permitExpirationDate: z.string(),
})
  .refine(data => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine(
    data => {
      if (!data.parent1Email) return true
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.parent1Email)
    },
    { message: 'Invalid email address', path: ['parent1Email'] },
  )
  .refine(
    data => {
      if (!data.parent2Email) return true
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.parent2Email)
    },
    { message: 'Invalid email address', path: ['parent2Email'] },
  )

type FormValues = z.infer<typeof registrationSchema>

interface StudentRegistrationFormProps {
  registrationCode: string
  schoolName: string
}

// ── Component ────────────────────────────────────────────────

export function StudentRegistrationForm({ registrationCode, schoolName }: StudentRegistrationFormProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      firstName: '',
      middleName: '',
      lastName: '',
      email: '',
      password: '',
      confirmPassword: '',
      phone: '',
      address: '',
      city: '',
      state: 'IL',
      zipCode: '',
      gender: '',
      dobMonth: '',
      dobDay: '',
      dobYear: '',
      parent1Name: '',
      parent1Phone: '',
      parent1Email: '',
      parent2Name: '',
      parent2Phone: '',
      parent2Email: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      emergencyContactRelationship: '',
      schoolReferral: 'no',
      roadTestStatus: '',
      wearsGlassesContacts: '',
      medicalConditions: '',
      howHeardAboutUs: '',
      hasLearnersPermit: '',
      permitNumber: '',
      permitIssuedDate: '',
      permitExpirationDate: '',
    },
  })

  const hasPermit = form.watch('hasLearnersPermit')

  async function onSubmit(values: FormValues) {
    setIsLoading(true)
    setError(null)

    // Build date of birth
    const dob = `${values.dobYear}-${values.dobMonth.padStart(2, '0')}-${values.dobDay.padStart(2, '0')}`

    try {
      const res = await fetch('/api/register/student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registrationCode,
          firstName: values.firstName,
          middleName: values.middleName,
          lastName: values.lastName,
          email: values.email,
          password: values.password,
          phone: values.phone,
          address: values.address,
          city: values.city,
          state: values.state,
          zipCode: values.zipCode,
          gender: values.gender,
          dateOfBirth: dob,
          parent1Name: values.parent1Name,
          parent1Phone: values.parent1Phone,
          parent1Email: values.parent1Email,
          parent2Name: values.parent2Name,
          parent2Phone: values.parent2Phone,
          parent2Email: values.parent2Email,
          emergencyContactName: values.emergencyContactName,
          emergencyContactPhone: values.emergencyContactPhone,
          emergencyContactRelationship: values.emergencyContactRelationship,
          schoolReferral: values.schoolReferral === 'yes',
          roadTestStatus: values.roadTestStatus,
          wearsGlassesContacts: values.wearsGlassesContacts,
          medicalConditions: values.medicalConditions,
          howHeardAboutUs: values.howHeardAboutUs,
          hasLearnersPermit: values.hasLearnersPermit === 'yes',
          permitNumber: values.permitNumber,
          permitIssuedDate: values.permitIssuedDate || null,
          permitExpirationDate: values.permitExpirationDate || null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Registration failed. Please try again.')
        return
      }

      setSuccess(true)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Success state ──────────────────────────────────────────
  if (success) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold">Registration Complete!</h2>
          <p className="text-muted-foreground mt-2">
            Your account at {schoolName} has been created successfully.
          </p>
          <Button className="mt-6" onClick={() => router.push('/login')}>
            Sign In
          </Button>
        </CardContent>
      </Card>
    )
  }

  // ── Months / Days / Years ──────────────────────────────────
  const months = [
    { value: '1', label: 'January' }, { value: '2', label: 'February' },
    { value: '3', label: 'March' }, { value: '4', label: 'April' },
    { value: '5', label: 'May' }, { value: '6', label: 'June' },
    { value: '7', label: 'July' }, { value: '8', label: 'August' },
    { value: '9', label: 'September' }, { value: '10', label: 'October' },
    { value: '11', label: 'November' }, { value: '12', label: 'December' },
  ]
  const days = Array.from({ length: 31 }, (_, i) => String(i + 1))
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 80 }, (_, i) => String(currentYear - 14 - i))

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* ── Personal Information ─────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Personal Information</CardTitle>
            <CardDescription>Fields marked with * are required</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Name */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField control={form.control} name="firstName" render={({ field }) => (
                <FormItem>
                  <FormLabel>First Name *</FormLabel>
                  <FormControl><Input placeholder="First Name" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="middleName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Middle Name</FormLabel>
                  <FormControl><Input placeholder="Middle Name" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="lastName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Last Name *</FormLabel>
                  <FormControl><Input placeholder="Last Name" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Address */}
            <FormField control={form.control} name="address" render={({ field }) => (
              <FormItem>
                <FormLabel>Address *</FormLabel>
                <FormControl><Input placeholder="Street address" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <FormField control={form.control} name="city" render={({ field }) => (
                <FormItem className="col-span-2 sm:col-span-1">
                  <FormLabel>City *</FormLabel>
                  <FormControl><Input placeholder="City" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="state" render={({ field }) => (
                <FormItem>
                  <FormLabel>State *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="State" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {US_STATES.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="zipCode" render={({ field }) => (
                <FormItem>
                  <FormLabel>Zip Code *</FormLabel>
                  <FormControl><Input placeholder="Zip Code" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Contact */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Cell Phone *</FormLabel>
                  <FormControl><Input type="tel" placeholder="(555) 123-4567" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email *</FormLabel>
                  <FormControl><Input type="email" placeholder="you@example.com" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Password */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="password" render={({ field }) => (
                <FormItem>
                  <FormLabel>Password *</FormLabel>
                  <FormControl><Input type="password" placeholder="Min. 8 characters" autoComplete="new-password" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="confirmPassword" render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm Password *</FormLabel>
                  <FormControl><Input type="password" placeholder="Confirm password" autoComplete="new-password" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <Separator />

            {/* Date of Birth */}
            <div>
              <p className="text-sm font-medium mb-2">Date of Birth *</p>
              <div className="grid grid-cols-3 gap-3">
                <FormField control={form.control} name="dobMonth" render={({ field }) => (
                  <FormItem>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Month" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {months.map(m => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="dobDay" render={({ field }) => (
                  <FormItem>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Day" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {days.map(d => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="dobYear" render={({ field }) => (
                  <FormItem>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {years.map(y => (
                          <SelectItem key={y} value={y}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>

            {/* Gender */}
            <FormField control={form.control} name="gender" render={({ field }) => (
              <FormItem>
                <FormLabel>Gender *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="non-binary">Non-binary</SelectItem>
                    <SelectItem value="prefer-not-to-say">Prefer not to say</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
          </CardContent>
        </Card>

        {/* ── Parent / Guardian Information ───────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Parent / Guardian Information</CardTitle>
            <CardDescription>
              Parent / Guardian 1 is required. Parent / Guardian 2 is optional.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Parent 1 */}
            <div>
              <p className="text-sm font-medium mb-3">Parent / Guardian 1 *</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField control={form.control} name="parent1Name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name *</FormLabel>
                    <FormControl><Input placeholder="Full name" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="parent1Phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone *</FormLabel>
                    <FormControl><Input type="tel" placeholder="(555) 123-4567" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="parent1Email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl><Input type="email" placeholder="Optional" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>

            <Separator />

            {/* Parent 2 */}
            <div>
              <p className="text-sm font-medium mb-3">Parent / Guardian 2 (optional)</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField control={form.control} name="parent2Name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl><Input placeholder="Full name" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="parent2Phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl><Input type="tel" placeholder="(555) 123-4567" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="parent2Email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl><Input type="email" placeholder="Optional" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Emergency Contact ────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Emergency Contact</CardTitle>
            <CardDescription>A non-parent contact in case of emergency.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField control={form.control} name="emergencyContactName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl><Input placeholder="Contact name" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="emergencyContactPhone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Cell Phone *</FormLabel>
                  <FormControl><Input type="tel" placeholder="(555) 123-4567" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="emergencyContactRelationship" render={({ field }) => (
                <FormItem>
                  <FormLabel>Relationship *</FormLabel>
                  <FormControl><Input placeholder="e.g. Parent, Spouse" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          </CardContent>
        </Card>

        {/* ── Driving Information ──────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Driving Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField control={form.control} name="schoolReferral" render={({ field }) => (
              <FormItem>
                <FormLabel>Have you been referred by your school?</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="no">No</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="roadTestStatus" render={({ field }) => (
              <FormItem>
                <FormLabel>Road Test Status</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger><SelectValue placeholder="Please Select" /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="not_scheduled">Not Scheduled</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="passed">Passed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="wearsGlassesContacts" render={({ field }) => (
              <FormItem>
                <FormLabel>Wear Glasses/Contacts *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger><SelectValue placeholder="Please Select" /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="glasses">Glasses</SelectItem>
                    <SelectItem value="contacts">Contacts</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="medicalConditions" render={({ field }) => (
              <FormItem>
                <FormLabel>Do you have any medical or physical conditions that we should be aware of? *</FormLabel>
                <FormControl>
                  <Textarea rows={2} placeholder="List any conditions, or type 'None'" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="howHeardAboutUs" render={({ field }) => (
              <FormItem>
                <FormLabel>How did you hear about us? *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger><SelectValue placeholder="Please Select" /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="google">Google Search</SelectItem>
                    <SelectItem value="social_media">Social Media</SelectItem>
                    <SelectItem value="friend_family">Friend / Family</SelectItem>
                    <SelectItem value="school">School</SelectItem>
                    <SelectItem value="flyer">Flyer / Advertisement</SelectItem>
                    <SelectItem value="yelp">Yelp</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <Separator />

            {/* Learner's Permit */}
            <FormField control={form.control} name="hasLearnersPermit" render={({ field }) => (
              <FormItem>
                <FormLabel>Do you have a Learners Permit? *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger><SelectValue placeholder="Please Select" /></SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            {hasPermit === 'yes' && (
              <div className="space-y-4 pl-4 border-l-2 border-primary/20">
                <FormField control={form.control} name="permitNumber" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Permit #</FormLabel>
                    <FormControl><Input placeholder="Permit number" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField control={form.control} name="permitIssuedDate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Permit Issued Date</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="permitExpirationDate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Permit Expiration Date</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Submit ──────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Account
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="text-primary hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </form>
    </Form>
  )
}
