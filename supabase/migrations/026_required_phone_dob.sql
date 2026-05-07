-- ============================================================
-- HelixDriving - Migration 026: Phone + DOB required at signup
-- 1. Adds date_of_birth to instructor_applications.
-- 2. Updates handle_new_user_registration trigger to also write
--    date_of_birth from raw_user_meta_data on admin signup.
-- Existing rows keep nullable values; the app layer enforces
-- the requirement on new records.
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================

ALTER TABLE instructor_applications
  ADD COLUMN IF NOT EXISTS date_of_birth DATE;

CREATE OR REPLACE FUNCTION handle_new_user_registration()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_school_id UUID;
  school_name   TEXT;
  dob_text      TEXT;
  dob_value     DATE;
BEGIN
  school_name := NEW.raw_user_meta_data->>'school_name';

  -- If no school_name was provided, this user was created via the API
  -- (e.g. student self-registration or admin invite). Skip auto-creation.
  IF school_name IS NULL OR school_name = '' THEN
    RETURN NEW;
  END IF;

  -- Create the school
  INSERT INTO schools (name, email, registration_code)
  VALUES (school_name, NEW.email, substr(md5(random()::text), 1, 8))
  RETURNING id INTO new_school_id;

  dob_text := NEW.raw_user_meta_data->>'date_of_birth';
  IF dob_text IS NULL OR dob_text = '' THEN
    dob_value := NULL;
  ELSE
    dob_value := dob_text::DATE;
  END IF;

  -- Create the user profile as 'admin'
  INSERT INTO users (id, school_id, role, first_name, last_name, phone, date_of_birth)
  VALUES (
    NEW.id,
    new_school_id,
    'admin',
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    dob_value
  );

  RETURN NEW;
END;
$$;
