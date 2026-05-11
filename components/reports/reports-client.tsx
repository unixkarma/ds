'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ReportsData } from '@/lib/services/reports'
import { LessonsReport } from './lessons-report'
import { RevenueReport } from './revenue-report'
import { StudentProgressReport } from './student-progress-report'
import { InstructorWorkloadReport } from './instructor-workload-report'
import { InstructorPayrollReport } from './instructor-payroll-report'

interface ReportsClientProps {
  data: ReportsData
}

export function ReportsClient({ data }: ReportsClientProps) {
  return (
    <Tabs defaultValue="lessons">
      <TabsList className="grid grid-cols-5 w-full max-w-3xl">
        <TabsTrigger value="lessons">Lessons</TabsTrigger>
        <TabsTrigger value="revenue">Revenue</TabsTrigger>
        <TabsTrigger value="students">Students</TabsTrigger>
        <TabsTrigger value="instructors">Workload</TabsTrigger>
        <TabsTrigger value="payroll">Payroll</TabsTrigger>
      </TabsList>

      <TabsContent value="lessons" className="mt-6">
        <LessonsReport lessons={data.lessons} instructors={data.instructors} />
      </TabsContent>

      <TabsContent value="revenue" className="mt-6">
        <RevenueReport payments={data.payments} />
      </TabsContent>

      <TabsContent value="students" className="mt-6">
        <StudentProgressReport
          students={data.students}
          balances={data.studentBalances}
        />
      </TabsContent>

      <TabsContent value="instructors" className="mt-6">
        <InstructorWorkloadReport instructors={data.instructors} lessons={data.lessons} />
      </TabsContent>

      <TabsContent value="payroll" className="mt-6">
        <InstructorPayrollReport instructors={data.instructors} lessons={data.lessons} />
      </TabsContent>
    </Tabs>
  )
}
