-- ============================================================
-- DSS — Driving School Software
-- Migration 002: Row Level Security Policies
-- Run AFTER 001_initial_schema.sql
-- ============================================================

-- ── Enable RLS on all tables ──────────────────────────────────
ALTER TABLE schools    ENABLE ROW LEVEL SECURITY;
ALTER TABLE users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE students   ENABLE ROW LEVEL SECURITY;
ALTER TABLE instructors ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons    ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HELPER FUNCTIONS
-- These are used inside RLS policies to avoid repetition.
-- ============================================================

-- Returns the school_id of the currently authenticated user
CREATE OR REPLACE FUNCTION get_my_school_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT school_id FROM users WHERE id = auth.uid();
$$;

-- Returns the role of the currently authenticated user
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS user_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$;

-- Returns true if the current user is an admin of their school
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Returns true if the current user is an admin or instructor
CREATE OR REPLACE FUNCTION is_admin_or_instructor()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND role IN ('admin', 'instructor')
  );
$$;

-- ============================================================
-- schools
-- ============================================================

-- Users can only see their own school
CREATE POLICY "schools_select" ON schools
  FOR SELECT
  USING (id = get_my_school_id());

-- Only admins can update their school record
CREATE POLICY "schools_update" ON schools
  FOR UPDATE
  USING (id = get_my_school_id() AND is_admin());

-- ============================================================
-- users
-- ============================================================

-- Users can see all users in their school
CREATE POLICY "users_select" ON users
  FOR SELECT
  USING (school_id = get_my_school_id());

-- Users can update their own profile
CREATE POLICY "users_update_own" ON users
  FOR UPDATE
  USING (id = auth.uid());

-- Admins can update any user in their school
CREATE POLICY "users_update_admin" ON users
  FOR UPDATE
  USING (school_id = get_my_school_id() AND is_admin());

-- Admins can insert new users into their school (e.g. staff management)
CREATE POLICY "users_insert_admin" ON users
  FOR INSERT
  WITH CHECK (school_id = get_my_school_id() AND is_admin());

-- System/service role inserts (used during registration)
-- This is handled via the service role key — no policy needed for that path.

-- ============================================================
-- students
-- ============================================================

-- Admins and instructors can see all students in their school
CREATE POLICY "students_select_staff" ON students
  FOR SELECT
  USING (
    school_id = get_my_school_id()
    AND is_admin_or_instructor()
  );

-- Students can see their own record
CREATE POLICY "students_select_self" ON students
  FOR SELECT
  USING (user_id = auth.uid());

-- Parents can see their linked student record
CREATE POLICY "students_select_parent" ON students
  FOR SELECT
  USING (parent_user_id = auth.uid());

-- Only admins can create/update/delete student records
CREATE POLICY "students_insert" ON students
  FOR INSERT
  WITH CHECK (school_id = get_my_school_id() AND is_admin());

CREATE POLICY "students_update" ON students
  FOR UPDATE
  USING (school_id = get_my_school_id() AND is_admin());

CREATE POLICY "students_delete" ON students
  FOR DELETE
  USING (school_id = get_my_school_id() AND is_admin());

-- ============================================================
-- instructors
-- ============================================================

-- All school members can see instructors (students need this for booking)
CREATE POLICY "instructors_select" ON instructors
  FOR SELECT
  USING (school_id = get_my_school_id());

-- Only admins can manage instructors
CREATE POLICY "instructors_insert" ON instructors
  FOR INSERT
  WITH CHECK (school_id = get_my_school_id() AND is_admin());

CREATE POLICY "instructors_update" ON instructors
  FOR UPDATE
  USING (school_id = get_my_school_id() AND is_admin());

CREATE POLICY "instructors_delete" ON instructors
  FOR DELETE
  USING (school_id = get_my_school_id() AND is_admin());

-- ============================================================
-- vehicles
-- ============================================================

-- All school members can see vehicles
CREATE POLICY "vehicles_select" ON vehicles
  FOR SELECT
  USING (school_id = get_my_school_id());

-- Only admins can manage vehicles
CREATE POLICY "vehicles_insert" ON vehicles
  FOR INSERT
  WITH CHECK (school_id = get_my_school_id() AND is_admin());

CREATE POLICY "vehicles_update" ON vehicles
  FOR UPDATE
  USING (school_id = get_my_school_id() AND is_admin());

CREATE POLICY "vehicles_delete" ON vehicles
  FOR DELETE
  USING (school_id = get_my_school_id() AND is_admin());

-- ============================================================
-- lessons
-- ============================================================

-- Admins and instructors can see all lessons for their school
CREATE POLICY "lessons_select_staff" ON lessons
  FOR SELECT
  USING (
    school_id = get_my_school_id()
    AND is_admin_or_instructor()
  );

-- Students can see their own lessons
CREATE POLICY "lessons_select_student" ON lessons
  FOR SELECT
  USING (
    school_id = get_my_school_id()
    AND student_id IN (
      SELECT id FROM students WHERE user_id = auth.uid()
    )
  );

-- Admins and instructors can create lessons
CREATE POLICY "lessons_insert" ON lessons
  FOR INSERT
  WITH CHECK (
    school_id = get_my_school_id()
    AND is_admin_or_instructor()
  );

-- Admins and instructors can update lessons
CREATE POLICY "lessons_update" ON lessons
  FOR UPDATE
  USING (
    school_id = get_my_school_id()
    AND is_admin_or_instructor()
  );

-- Students can cancel their own upcoming lessons
CREATE POLICY "lessons_update_student_cancel" ON lessons
  FOR UPDATE
  USING (
    school_id = get_my_school_id()
    AND student_id IN (
      SELECT id FROM students WHERE user_id = auth.uid()
    )
    AND status = 'scheduled'
  );

-- Only admins can delete lessons
CREATE POLICY "lessons_delete" ON lessons
  FOR DELETE
  USING (school_id = get_my_school_id() AND is_admin());

-- ============================================================
-- packages
-- ============================================================

-- All school members can see active packages (students need this to buy)
CREATE POLICY "packages_select" ON packages
  FOR SELECT
  USING (school_id = get_my_school_id());

-- Only admins can manage packages
CREATE POLICY "packages_insert" ON packages
  FOR INSERT
  WITH CHECK (school_id = get_my_school_id() AND is_admin());

CREATE POLICY "packages_update" ON packages
  FOR UPDATE
  USING (school_id = get_my_school_id() AND is_admin());

CREATE POLICY "packages_delete" ON packages
  FOR DELETE
  USING (school_id = get_my_school_id() AND is_admin());

-- ============================================================
-- payments
-- ============================================================

-- Admins can see all payments for their school
CREATE POLICY "payments_select_admin" ON payments
  FOR SELECT
  USING (school_id = get_my_school_id() AND is_admin());

-- Students can see their own payments
CREATE POLICY "payments_select_student" ON payments
  FOR SELECT
  USING (
    school_id = get_my_school_id()
    AND student_id IN (
      SELECT id FROM students WHERE user_id = auth.uid()
    )
  );

-- Payments are created via service role (Stripe webhook) — no insert policy needed for client
-- Admins can update payment status (e.g. refunds)
CREATE POLICY "payments_update" ON payments
  FOR UPDATE
  USING (school_id = get_my_school_id() AND is_admin());

-- ============================================================
-- availability
-- ============================================================

-- All school members can see instructor availability (needed for booking)
CREATE POLICY "availability_select" ON availability
  FOR SELECT
  USING (
    instructor_id IN (
      SELECT id FROM instructors WHERE school_id = get_my_school_id()
    )
  );

-- Admins can manage all instructor availability
CREATE POLICY "availability_insert_admin" ON availability
  FOR INSERT
  WITH CHECK (
    is_admin()
    AND instructor_id IN (
      SELECT id FROM instructors WHERE school_id = get_my_school_id()
    )
  );

-- Instructors can manage their own availability
CREATE POLICY "availability_insert_instructor" ON availability
  FOR INSERT
  WITH CHECK (
    instructor_id IN (
      SELECT id FROM instructors WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "availability_update" ON availability
  FOR UPDATE
  USING (
    instructor_id IN (
      SELECT id FROM instructors
      WHERE school_id = get_my_school_id()
        AND (user_id = auth.uid() OR is_admin())
    )
  );

CREATE POLICY "availability_delete" ON availability
  FOR DELETE
  USING (
    instructor_id IN (
      SELECT id FROM instructors
      WHERE school_id = get_my_school_id()
        AND (user_id = auth.uid() OR is_admin())
    )
  );
