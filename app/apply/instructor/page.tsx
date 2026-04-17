import { createAdminClient } from '@/lib/supabase/admin'
import { InstructorApplicationForm } from '@/components/applications/instructor-application-form'

interface PageProps {
  searchParams: Promise<{ code?: string }>
}

export default async function InstructorApplicationPage({ searchParams }: PageProps) {
  const { code } = await searchParams

  let schoolName: string | null = null
  let validCode = false

  if (code) {
    const adminClient = createAdminClient()
    const { data } = await adminClient
      .from('schools')
      .select('name')
      .eq('registration_code', code)
      .single()

    if (data) {
      schoolName = data.name
      validCode = true
    }
  }

  return (
    <div className="min-h-screen bg-muted/50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary text-primary-foreground font-bold text-xl mb-3">
            H
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            {schoolName ?? 'HelixDriving'}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Instructor Application</p>
        </div>

        {!code || !validCode ? (
          <div className="text-center py-12">
            <h2 className="text-lg font-semibold">Invalid Application Link</h2>
            <p className="text-muted-foreground text-sm mt-2">
              Please use the application link provided by the driving school.
            </p>
          </div>
        ) : (
          <InstructorApplicationForm
            registrationCode={code}
            schoolName={schoolName!}
          />
        )}
      </div>
    </div>
  )
}
