// ============================================================
// DSS — Driving School Software
// Central TypeScript types — mirrors the Supabase database schema
// ============================================================

export type UserRole = 'admin' | 'instructor' | 'student' | 'parent'

export type StudentStatus = 'active' | 'inactive' | 'completed'

export type LessonStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show'

export type PaymentStatus = 'pending' | 'completed' | 'refunded' | 'failed'

// ── Schools ──────────────────────────────────────────────────
export interface School {
  id: string
  name: string
  email: string
  phone: string
  address: string
  created_at: string
}

// ── Users (extends Supabase auth.users) ──────────────────────
export interface User {
  id: string
  school_id: string
  role: UserRole
  first_name: string
  last_name: string
  phone: string
  date_of_birth: string | null
  created_at: string
}

export interface UserWithSchool extends User {
  school: School
}

// ── Students ─────────────────────────────────────────────────
export interface Student {
  id: string
  user_id: string
  school_id: string
  parent_user_id: string | null
  enrollment_date: string
  status: StudentStatus
  total_lessons_purchased: number
  total_lessons_completed: number
  notes: string | null
  created_at?: string
}

export interface StudentWithUser extends Student {
  user: User
  parent?: User | null
}

// ── Instructors ───────────────────────────────────────────────
export interface Instructor {
  id: string
  user_id: string
  school_id: string
  license_number: string
  is_active: boolean
  max_lessons_per_day: number
}

export interface InstructorWithUser extends Instructor {
  user: User
}

// ── Vehicles ─────────────────────────────────────────────────
export interface Vehicle {
  id: string
  school_id: string
  make: string
  model: string
  year: number
  license_plate: string
  is_active: boolean
}

// ── Lessons ───────────────────────────────────────────────────
export interface Lesson {
  id: string
  school_id: string
  student_id: string
  instructor_id: string
  vehicle_id: string | null
  scheduled_at: string
  duration_minutes: number
  status: LessonStatus
  notes: string | null
  created_at: string
}

export interface LessonWithRelations extends Lesson {
  student: StudentWithUser
  instructor: InstructorWithUser
  vehicle: Vehicle | null
}

// ── Packages ─────────────────────────────────────────────────
export interface Package {
  id: string
  school_id: string
  name: string
  description: string
  lesson_count: number
  price_cents: number
  is_active: boolean
}

// ── Payments ─────────────────────────────────────────────────
export interface Payment {
  id: string
  school_id: string
  student_id: string
  package_id: string | null
  stripe_payment_intent_id: string
  amount_cents: number
  status: PaymentStatus
  created_at: string
}

export interface PaymentWithRelations extends Payment {
  student: StudentWithUser
  package: Package | null
}

// ── Availability ─────────────────────────────────────────────
export interface Availability {
  id: string
  instructor_id: string
  day_of_week: number // 0 = Sunday, 6 = Saturday
  start_time: string  // HH:MM:SS
  end_time: string    // HH:MM:SS
}

// ── API / Form helpers ────────────────────────────────────────
export interface ApiError {
  message: string
  code?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  count: number
  page: number
  pageSize: number
}

// Dashboard summary card data
export interface DashboardStats {
  totalActiveStudents: number
  lessonsTodayCount: number
  revenueThisMonthCents: number
  upcomingLessons: LessonWithRelations[]
}
