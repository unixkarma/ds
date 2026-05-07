// ============================================================
// DSS — Driving School Software
// Central TypeScript types — mirrors the Supabase database schema
// ============================================================

export type UserRole = 'admin' | 'instructor' | 'student' | 'parent'

export type StudentStatus = 'active' | 'inactive' | 'completed'

export type LessonStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show'

export type PaymentStatus = 'pending' | 'completed' | 'refunded' | 'failed'

// ── Schools ──────────────────────────────────────────────────
export type SchoolTimezone =
  | 'America/New_York'
  | 'America/Chicago'
  | 'America/Denver'
  | 'America/Los_Angeles'
  | 'America/Anchorage'
  | 'America/Phoenix'
  | 'Pacific/Honolulu'

export interface School {
  id: string
  name: string
  email: string
  phone: string
  address: string
  registration_code: string
  timezone: SchoolTimezone
  stripe_publishable_key: string | null
  stripe_secret_key: string | null
  stripe_webhook_secret: string | null
  single_lesson_price_cents: number
  student_cancellation_fee_cents: number
  instructor_cancellation_fee_cents: number
  max_booking_days_ahead: number
  created_at: string
}

// ── Users (extends Supabase auth.users) ──────────────────────
export interface User {
  id: string
  school_id: string
  role: UserRole
  first_name: string
  middle_name: string
  last_name: string
  email: string
  phone: string
  address: string
  city: string
  state: string
  zip_code: string
  gender: string
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
  lessons_remaining: number
  notes: string | null
  emergency_contact_name: string
  emergency_contact_phone: string
  emergency_contact_relationship: string
  road_test_status: string
  wears_glasses_contacts: string
  medical_conditions: string
  how_heard_about_us: string
  has_learners_permit: boolean | null
  permit_number: string
  permit_issued_date: string | null
  permit_expiration_date: string | null
  permit_photo_url: string
  school_referral: boolean
  created_at?: string
}

export interface StudentWithUser extends Student {
  user: User
  parent?: User | null
}

// ── Instructor modality ──────────────────────────────────────
export type InstructorModality = 'school' | 'independent'

// ── Instructors ───────────────────────────────────────────────
export interface Instructor {
  id: string
  user_id: string
  school_id: string
  license_number: string
  is_active: boolean
  max_lessons_per_day: number
  modality: InstructorModality
  commission_rate: number
  hourly_rate_cents: number
  lesson_price_cents: number | null
  uses_school_vehicle: boolean
  vehicle_monthly_fee_cents: number
  service_area: string
  buffer_minutes: number
}

export interface InstructorWithUser extends Instructor {
  user: User
}

export interface InstructorWithUserAndAvailability extends InstructorWithUser {
  availability: Availability[]
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

// ── Lesson sale origin ───────────────────────────────────────
export type LessonSoldBy = 'school' | 'instructor'
export type LessonCancelledBy = 'student' | 'instructor' | 'admin'

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
  notes_covered: string
  notes_practice: string
  notes_additional: string
  pickup_location: string
  dropoff_location: string
  sold_by: LessonSoldBy
  price_cents: number
  instructor_earning_cents: number
  cancelled_by: LessonCancelledBy | null
  cancellation_fee_cents: number
  opening_id: string | null
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
  stripe_payment_intent_id: string | null
  amount_cents: number
  status: PaymentStatus
  payment_method: string | null
  card_brand: string | null
  card_last4: string | null
  receipt_url: string | null
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

// ── Instructor Applications ──────────────────────────────────
export type ApplicationStatus = 'pending' | 'approved' | 'rejected'

export interface InstructorApplication {
  id: string
  school_id: string
  first_name: string
  last_name: string
  email: string
  phone: string
  date_of_birth: string | null
  workers_comp_doc_url: string | null
  car_insurance_doc_url: string | null
  service_area: string
  status: ApplicationStatus
  admin_notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

// Dashboard summary card data
export interface DashboardStats {
  totalActiveStudents: number
  lessonsTodayCount: number
  revenueThisMonthCents: number
  upcomingLessons: LessonWithRelations[]
}

// ── Openings & Templates (Step 13) ───────────────────────────
export type OpeningStatus = 'available' | 'booked' | 'blocked'

export interface OpeningTemplateSlot {
  start: string         // "HH:MM" 24h
  duration_min: number  // minutes
}

export interface OpeningTemplate {
  id: string
  school_id: string
  instructor_id: string | null  // NULL = school-wide default
  name: string
  slots: OpeningTemplateSlot[]
  day_of_week: number[]         // 0..6, 0=Sun, 6=Sat — which days the template applies to
  created_at: string
}

export interface Opening {
  id: string
  school_id: string
  instructor_id: string
  template_id: string | null
  scheduled_at: string
  duration_minutes: number
  status: OpeningStatus
  created_at: string
}

export interface OpeningWithInstructor extends Opening {
  instructor: InstructorWithUser
}

export interface InstructorDayOff {
  id: string
  school_id: string
  instructor_id: string
  date: string         // YYYY-MM-DD
  reason: string | null
  created_at: string
}
