-- ============================================================
-- DSS — Driving School Software
-- Migration 005: Fix auth trigger for API-created users
-- The handle_new_user_registration trigger should only fire for
-- admin sign-ups (which pass school_name in metadata).
-- Students/instructors created via API already have their
-- users + students rows inserted by the API route.
-- ============================================================

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

  -- If no school_name was provided, this user was created via the API
  -- (e.g. student self-registration or admin invite). Skip auto-creation.
  IF school_name IS NULL OR school_name = '' THEN
    RETURN NEW;
  END IF;

  -- Create the school
  INSERT INTO schools (name, email, registration_code)
  VALUES (school_name, NEW.email, substr(md5(random()::text), 1, 8))
  RETURNING id INTO new_school_id;

  -- Create the user profile as 'admin'
  INSERT INTO users (id, school_id, role, first_name, last_name, phone)
  VALUES (
    NEW.id,
    new_school_id,
    'admin',
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', '')
  );

  RETURN NEW;
END;
$$;
