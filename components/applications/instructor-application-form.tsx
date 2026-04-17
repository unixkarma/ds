'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, CheckCircle2, Upload, FileText } from 'lucide-react'

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
import { Alert, AlertDescription } from '@/components/ui/alert'

// ── Validation ───────────────────────────────────────────────
const applicationSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Valid email required'),
  phone: z.string().min(1, 'Phone number is required'),
  serviceArea: z.string().min(1, 'Service area is required'),
})

type FormValues = z.infer<typeof applicationSchema>

interface InstructorApplicationFormProps {
  registrationCode: string
  schoolName: string
}

// ── Component ────────────────────────────────────────────────
export function InstructorApplicationForm({
  registrationCode,
  schoolName,
}: InstructorApplicationFormProps) {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  // File refs
  const workersCompRef = useRef<HTMLInputElement>(null)
  const carInsuranceRef = useRef<HTMLInputElement>(null)
  const [workersCompFile, setWorkersCompFile] = useState<File | null>(null)
  const [carInsuranceFile, setCarInsuranceFile] = useState<File | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(applicationSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      serviceArea: '',
    },
  })

  async function onSubmit(values: FormValues) {
    // Validate files
    if (!workersCompFile) {
      setError('Workers Compensation document is required')
      return
    }
    if (!carInsuranceFile) {
      setError('Car Insurance document is required')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('registrationCode', registrationCode)
      formData.append('firstName', values.firstName)
      formData.append('lastName', values.lastName)
      formData.append('email', values.email)
      formData.append('phone', values.phone)
      formData.append('serviceArea', values.serviceArea)
      formData.append('workersCompDoc', workersCompFile)
      formData.append('carInsuranceDoc', carInsuranceFile)

      const res = await fetch('/api/instructor-applications', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Application failed. Please try again.')
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
          <h2 className="text-xl font-bold">Application Submitted!</h2>
          <p className="text-muted-foreground mt-2">
            Your application to {schoolName} has been submitted successfully.
            An administrator will review your documents and get back to you.
          </p>
        </CardContent>
      </Card>
    )
  }

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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="firstName" render={({ field }) => (
                <FormItem>
                  <FormLabel>First Name *</FormLabel>
                  <FormControl><Input placeholder="First Name" {...field} /></FormControl>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email *</FormLabel>
                  <FormControl><Input type="email" placeholder="you@example.com" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone *</FormLabel>
                  <FormControl><Input type="tel" placeholder="(555) 123-4567" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            {/* Service Area */}
            <FormField control={form.control} name="serviceArea" render={({ field }) => (
              <FormItem>
                <FormLabel>Service Area *</FormLabel>
                <FormControl>
                  <Textarea
                    rows={2}
                    placeholder="e.g. North Side Chicago, Lincoln Park, Lakeview, 60614, 60657"
                    {...field}
                  />
                </FormControl>
                <p className="text-xs text-muted-foreground mt-1">
                  List the neighborhoods, cities, or zip codes where you can provide lessons.
                </p>
                <FormMessage />
              </FormItem>
            )} />
          </CardContent>
        </Card>

        {/* ── Documents ──────────��────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Required Documents</CardTitle>
            <CardDescription>
              Upload PDF, JPEG, PNG, or WebP files (max 10 MB each)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Workers Compensation */}
            <div>
              <p className="text-sm font-medium mb-2">Personal Workers Compensation *</p>
              <input
                ref={workersCompRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={(e) => setWorkersCompFile(e.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => workersCompRef.current?.click()}
              >
                {workersCompFile ? (
                  <>
                    <FileText className="h-4 w-4 text-emerald-500" />
                    <span className="truncate">{workersCompFile.name}</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Choose file...
                  </>
                )}
              </Button>
            </div>

            {/* Car Insurance */}
            <div>
              <p className="text-sm font-medium mb-2">Personal Car Insurance *</p>
              <input
                ref={carInsuranceRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={(e) => setCarInsuranceFile(e.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => carInsuranceRef.current?.click()}
              >
                {carInsuranceFile ? (
                  <>
                    <FileText className="h-4 w-4 text-emerald-500" />
                    <span className="truncate">{carInsuranceFile.name}</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Choose file...
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Submit ──────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Application
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
