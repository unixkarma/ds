import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'

import { getStudentFullReport } from '@/lib/services/students'
import { StudentFullReportView } from '@/components/classroom/student-full-report'

export const metadata: Metadata = { title: 'Student report' }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function StudentReportPage({ params }: PageProps) {
  const { id } = await params
  const report = await getStudentFullReport(id)
  if (!report) notFound()

  return (
    <div className="space-y-4">
      <Link
        href={`/dashboard/students/${id}`}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors print:hidden"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to student
      </Link>

      <StudentFullReportView report={report} />
    </div>
  )
}
