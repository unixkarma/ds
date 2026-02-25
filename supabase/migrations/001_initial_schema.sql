-- ============================================================
-- DSS — Driving School Software
-- Migration 001: Initial Schema
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── Enable UUID extension ─────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Custom ENUM types ─────────────────────────────────────────
CREATE TYPE user_role AS ENUM ('admin', 'instructor', 'student', 'parent');
CREATE TYPE student_status AS ENUM ('active', 'inactive', 'completed');
CREATE TYPE lesson_status AS ENUM ('scheduled', 'completed', 'cancelled', 'no_show');
CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'refunded', 'failed');

-- ── schools ───────────────────────────────────────────────────
CREATE TABLE schools (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  phone      TEXT NOT NULL DEFAULT '',
  address    TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── users (public profile — extends auth.users) ───────────────
CREATE TABLE users (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  role          user_role NOT NULL DEFAULT 'student',
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  phone         TEXT NOT NULL DEFAULT '',
  date_of_birth DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── students ──────────────────────────────────────────────────
CREATE TABLE students (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_id                UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  parent_user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  enrollment_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  status                   student_status NOT NULL DEFAULT 'active',
  total_lessons_purchased  INTEGER NOT NULL DEFAULT 0,
  total_lessons_completed  INTEGER NOT NULL DEFAULT 0,
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── instructors ───────────────────────────────────────────────
CREATE TABLE instructors (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_id           UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  license_number      TEXT NOT NULL DEFAULT '',
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  max_lessons_per_day INTEGER NOT NULL DEFAULT 6
);

-- ── vehicles ──────────────────────────────────────────────────
CREATE TABLE vehicles (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  make          TEXT NOT NULL,
  model         TEXT NOT NULL,
  year          INTEGER NOT NULL,
  license_plate TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

-- ── lessons ───────────────────────────────────────────────────
CREATE TABLE lessons (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id       UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  instructor_id    UUID NOT NULL REFERENCES instructors(id) ON DELETE RESTRICT,
  vehicle_id       UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  scheduled_at     TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  status           lesson_status NOT NULL DEFAULT 'scheduled',
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── packages (lesson bundles) ─────────────────────────────────
CREATE TABLE packages (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id    UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  lesson_count INTEGER NOT NULL,
  price_cents  INTEGER NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE
);

-- ── payments ──────────────────────────────────────────────────
CREATE TABLE payments (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id                UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id               UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  package_id               UUID REFERENCES packages(id) ON DELETE SET NULL,
  stripe_payment_intent_id TEXT NOT NULL,
  amount_cents             INTEGER NOT NULL,
  status                   payment_status NOT NULL DEFAULT 'pending',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── availability (instructor weekly schedule) ─────────────────
CREATE TABLE availability (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  instructor_id UUID NOT NULL REFERENCES instructors(id) ON DELETE CASCADE,
  day_of_week   INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

-- ── Indexes for performance ───────────────────────────────────
CREATE INDEX idx_users_school_id          ON users(school_id);
CREATE INDEX idx_students_school_id       ON students(school_id);
CREATE INDEX idx_students_user_id         ON students(user_id);
CREATE INDEX idx_instructors_school_id    ON instructors(school_id);
CREATE INDEX idx_lessons_school_id        ON lessons(school_id);
CREATE INDEX idx_lessons_student_id       ON lessons(student_id);
CREATE INDEX idx_lessons_instructor_id    ON lessons(instructor_id);
CREATE INDEX idx_lessons_scheduled_at     ON lessons(scheduled_at);
CREATE INDEX idx_payments_school_id       ON payments(school_id);
CREATE INDEX idx_payments_student_id      ON payments(student_id);
CREATE INDEX idx_availability_instructor  ON availability(instructor_id);
