'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ReportsData } from '@/lib/services/reports'
import { LessonsReport } from './lessons-report'
import { RevenueReport } from './revenue-report'
import { StudentProgressReport } from './student-progress-report'
import { InstructorWorkloadReport } from './instructor-workload-report'
import { InstructorPayrollReport } from './instructor-payroll-report'
import { ClassroomReport } from './classroom-report'
import { StudentHoursReport } from './student-hours-report'

interface ReportsClientProps {
  data: ReportsData
}

export function ReportsClient({ data }: ReportsClientProps) {
  return (
    <Tabs defaultValue="lessons">
      <TabsList className="grid grid-cols-7 w-full max-w-4xl">
        <TabsTrigger value="lessons">Lessons</TabsTrigger>
        <TabsTrigger value="classroom">Classroom</TabsTrigger>
        <TabsTrigger value="revenue">Revenue</TabsTrigger>
        <TabsTrigger value="students">Students</TabsTrigger>
        <TabsTrigger value="hours">Hours</TabsTrigger>
        <TabsTrigger value="instructors">Workload</TabsTrigger>
        <TabsTrigger value="payroll">Payroll</TabsTrigger>
      </TabsList>

      <TabsContent value="lessons" className="mt-6">
        <LessonsReport lessons={data.lessons} instructors={data.instructors} />
      </TabsContent>

      <TabsContent value="classroom" className="mt-6">
        <ClassroomReport sessions={data.classroomSessions} />
      </TabsContent>

      <TabsContent value="revenue" className="mt-6">
        <RevenueReport
          payments={data.payments}
          purchases={data.purchases}
          ledger={data.ledger}
          balances={data.studentBalances}
        />
      </TabsContent>

      <TabsContent value="students" className="mt-6">
        <StudentProgressReport
          students={data.students}
          balances={data.studentBalances}
        />
      </TabsContent>

      <TabsContent value="hours" className="mt-6">
        <StudentHoursReport
          students={data.students}
          purchases={data.purchases}
          balances={data.studentBalances}
        />
      </TabsContent>

      <TabsContent value="instructors" className="mt-6">
        <InstructorWorkloadReport instructors={data.instructors} lessons={data.lessons} />
      </TabsContent>

      <TabsContent value="payroll" className="mt-6">
        <InstructorPayrollReport
          instructors={data.instructors}
          lessons={data.lessons}
          purchases={data.purchases}
          assignments={data.assignments}
          deductions={data.deductions}
          reimbursements={data.reimbursements}
        />
      </TabsContent>
    </Tabs>
  )
}
