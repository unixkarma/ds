-- ============================================================
-- HelixDriving
-- Migration 004: Add email column + fix auth trigger
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── 1. Add email column to users table ───────────────────────
-- We store email in our public users table for easy querying.
-- The authoritative source is still auth.users; this is a mirror.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ── 2. Fix the auth trigger ───────────────────────────────────
-- The old trigger always created a new school for every user.
-- The new trigger ONLY creates a school when `school_name` metadata
-- is present — which only happens during the /register admin self-signup flow.
-- Students and instructors are created by API routes which insert into
-- users/students manually after calling auth.admin.inviteUserByEmail().

CREATE OR REPLACE FUNCTION handle_new_user_registration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_school_id UUID;
  school_name   TEXT;
BEGIN
  school_name := NEW.raw_user_meta_data->>'school_name';

  -- If no school_name in metadata, this is an admin-invited user.
  -- The API route handles the users/students row creation manually.
  IF school_name IS NULL OR school_name = '' THEN
    RETURN NEW;
  END IF;

  -- Admin self-registration: create the school
  INSERT INTO schools (name, email)
  VALUES (school_name, NEW.email)
  RETURNING id INTO new_school_id;

  -- Create the admin user profile (now includes email)
  INSERT INTO users (id, school_id, role, first_name, last_name, phone, email)
  VALUES (
    NEW.id,
    new_school_id,
    'admin',
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.email, '')
  );

  RETURN NEW;
END;
$$;
