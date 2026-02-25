-- ============================================================
-- DSS — Driving School Software
-- Migration 003: Auth Trigger
-- Automatically creates a schools row + users row when a new
-- user registers via Supabase Auth.
-- ============================================================

-- This function fires after a new row is inserted into auth.users.
-- It creates a school and a user profile in one transaction.
-- Only used for the initial admin registration flow.
-- Subsequent users (students, instructors) are created manually by the admin.

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
  -- The school name is passed via raw_user_meta_data during signUp()
  school_name := NEW.raw_user_meta_data->>'school_name';

  -- If no school_name was provided, default to the user's email domain
  IF school_name IS NULL OR school_name = '' THEN
    school_name := split_part(NEW.email, '@', 1) || '''s Driving School';
  END IF;

  -- Create the school
  INSERT INTO schools (name, email)
  VALUES (school_name, NEW.email)
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

-- Attach the trigger to auth.users
-- Note: this trigger only fires for new registrations via the /register page.
-- When admins add students/instructors, they go through the API route instead.
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user_registration();
