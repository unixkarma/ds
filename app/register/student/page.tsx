import { createAdminClient } from '@/lib/supabase/admin'
import { StudentRegistrationForm } from '@/components/student/student-registration-form'

interface PageProps {
  searchParams: Promise<{ school?: string }>
}

export default async function StudentRegistrationPage({ searchParams }: PageProps) {
  const { school: code } = await searchParams

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
          <p className="text-muted-foreground text-sm mt-1">Student Registration</p>
        </div>

        {!code || !validCode ? (
          <div className="text-center py-12">
            <h2 className="text-lg font-semibold">Invalid Registration Link</h2>
            <p className="text-muted-foreground text-sm mt-2">
              Please use the registration link provided by your driving school.
            </p>
          </div>
        ) : (
          <StudentRegistrationForm
            registrationCode={code}
            schoolName={schoolName!}
          />
        )}
      </div>
    </div>
  )
}
