import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { ChevronLeft, Mail, Phone, Calendar, FileText, Pencil, ImageIcon } from 'lucide-react'

import { getStudentById } from '@/lib/services/students'
import { getActivePackages } from '@/lib/services/packages'
import { formatDate, formatDateTime, getFullName } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { StudentStatusToggle } from '@/components/students/student-status-toggle'
import { RecordPaymentDialog } from '@/components/students/record-payment-dialog'
import type { StudentStatus, LessonStatus } from '@/types'

export const metadata: Metadata = { title: 'Student Details' }

// ── Status badge configs ──────────────────────────────────────
const studentStatusConfig: Record<StudentStatus, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  active: { label: 'Active', variant: 'default' },
  inactive: { label: 'Inactive', variant: 'secondary' },
  completed: { label: 'Completed', variant: 'outline' },
}

const lessonStatusConfig: Record<LessonStatus, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  scheduled: { label: 'Scheduled', variant: 'secondary' },
  completed: { label: 'Completed', variant: 'default' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
  no_show: { label: 'No Show', variant: 'outline' },
}

// ── Page ──────────────────────────────────────────────────────
export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let student, lessons
  try {
    ;({ student, lessons } = await getStudentById(id))
  } catch {
    notFound()
  }

  const packages = await getActivePackages()
  const remaining = student.total_lessons_purchased - student.total_lessons_completed
  const statusConf = studentStatusConfig[student.status]

  return (
    <div className="max-w-4xl space-y-6">
      {/* Back link */}
      <Link
        href="/dashboard/students"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Students
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">{getFullName(student.user)}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Enrolled {formatDate(student.enrollment_date)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusConf.variant}>{statusConf.label}</Badge>
          <Link href={`/dashboard/students/${id}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Edit
            </Button>
          </Link>
          <StudentStatusToggle student={student} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Profile card */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-4 w-4 flex-shrink-0" />
              <span>{student.user.email || '—'}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="h-4 w-4 flex-shrink-0" />
              <span>{student.user.phone || '—'}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4 flex-shrink-0" />
              <span>
                {student.user.date_of_birth
                  ? formatDate(student.user.date_of_birth)
                  : '—'}
              </span>
            </div>
            {student.notes && (
              <>
                <Separator />
                <div className="flex items-start gap-2 text-muted-foreground">
                  <FileText className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span className="whitespace-pre-wrap">{student.notes}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Lesson balance card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lesson Balance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Purchased</span>
              <span className="font-medium">{student.total_lessons_purchased}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Completed</span>
              <span className="font-medium">{student.total_lessons_completed}</span>
            </div>
            <Separator />
            <div className="flex justify-between">
              <span className="font-medium">Remaining</span>
              <span
                className={
                  remaining > 0
                    ? 'font-bold text-primary'
                    : remaining === 0
                    ? 'font-bold text-muted-foreground'
                    : 'font-bold text-destructive'
                }
              >
                {remaining}
              </span>
            </div>
            <Separator />
            <RecordPaymentDialog studentId={student.id} packages={packages} />
          </CardContent>
        </Card>
      </div>

      {/* Permit photo */}
      {student.permit_photo_url && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              Learner&apos;s Permit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg overflow-hidden border bg-muted inline-block">
              <img
                src={student.permit_photo_url}
                alt="Learner's permit"
                className="max-h-[400px] object-contain"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lesson history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lesson History</CardTitle>
        </CardHeader>
        <CardContent>
          {lessons.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No lessons recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left font-medium text-muted-foreground pb-3 pr-4">
                      Date &amp; Time
                    </th>
                    <th className="text-left font-medium text-muted-foreground pb-3 pr-4">
                      Instructor
                    </th>
                    <th className="text-left font-medium text-muted-foreground pb-3 pr-4">
                      Duration
                    </th>
                    <th className="text-left font-medium text-muted-foreground pb-3">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lessons.map((lesson) => {
                    const lConf = lessonStatusConfig[lesson.status]
                    return (
                      <tr key={lesson.id}>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {formatDateTime(lesson.scheduled_at)}
                        </td>
                        <td className="py-3 pr-4">
                          {getFullName(lesson.instructor.user)}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {lesson.duration_minutes} min
                        </td>
                        <td className="py-3">
                          <Badge variant={lConf.variant}>{lConf.label}</Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
