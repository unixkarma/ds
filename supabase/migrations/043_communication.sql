-- ============================================================
-- HelixDriving - Migration 043: Communication Center + editable email templates
-- Adds:
--   1. email_templates   — per-school override of the hardcoded lib/email builders
--   2. messages          — per-student outbound/inbound message log (email channel)
--   3. broadcasts        — bulk message to students or staff (audit + counts)
--   4. RLS for all three (admin full; student sees own messages)
--
-- Design notes:
--   - Email builders in lib/email/* keep their hardcoded HTML as the fallback.
--     A row here (enabled=true) OVERRIDES the default for that (school, key).
--   - Channel is 'email' only for now (no Twilio/SMS in deps — out of scope).
--   - subject/body support simple {{var}} interpolation done in the service layer.
--
-- Run this in: Supabase Dashboard -> SQL Editor
-- ============================================================

-- ── 1. email_templates ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  template_key  TEXT NOT NULL,
  subject       TEXT NOT NULL DEFAULT '',
  html_body     TEXT NOT NULL DEFAULT '',
  text_body     TEXT NOT NULL DEFAULT '',
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, template_key)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_templates_key_check'
  ) THEN
    ALTER TABLE email_templates
      ADD CONSTRAINT email_templates_key_check
      CHECK (template_key IN ('package_confirmation', 'payment_link', 'day_off_decision'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_email_templates_school ON email_templates (school_id);


-- ── 2. messages ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  direction   TEXT NOT NULL DEFAULT 'outbound',
  channel     TEXT NOT NULL DEFAULT 'email',
  subject     TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'sent',
  sent_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_direction_check') THEN
    ALTER TABLE messages ADD CONSTRAINT messages_direction_check
      CHECK (direction IN ('outbound', 'inbound'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_channel_check') THEN
    ALTER TABLE messages ADD CONSTRAINT messages_channel_check
      CHECK (channel IN ('email'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_status_check') THEN
    ALTER TABLE messages ADD CONSTRAINT messages_status_check
      CHECK (status IN ('sent', 'failed', 'received'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_messages_school_student_time
  ON messages (school_id, student_id, created_at DESC);


-- ── 3. broadcasts ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS broadcasts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  audience         TEXT NOT NULL DEFAULT 'students',
  subject          TEXT NOT NULL DEFAULT '',
  body             TEXT NOT NULL DEFAULT '',
  recipient_count  INT NOT NULL DEFAULT 0 CHECK (recipient_count >= 0),
  sent_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'broadcasts_audience_check') THEN
    ALTER TABLE broadcasts ADD CONSTRAINT broadcasts_audience_check
      CHECK (audience IN ('students', 'staff'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_broadcasts_school_time
  ON broadcasts (school_id, created_at DESC);


-- ── 4. RLS ─────────────────────────────────────────────────────
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcasts      ENABLE ROW LEVEL SECURITY;

-- ── email_templates: admin only ──
DROP POLICY IF EXISTS email_templates_select ON email_templates;
CREATE POLICY email_templates_select ON email_templates
  FOR SELECT TO authenticated
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS email_templates_insert ON email_templates;
CREATE POLICY email_templates_insert ON email_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS email_templates_update ON email_templates;
CREATE POLICY email_templates_update ON email_templates
  FOR UPDATE TO authenticated
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS email_templates_delete ON email_templates;
CREATE POLICY email_templates_delete ON email_templates
  FOR DELETE TO authenticated
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );

-- ── messages: admin full; student reads own ──
DROP POLICY IF EXISTS messages_select ON messages;
CREATE POLICY messages_select ON messages
  FOR SELECT TO authenticated
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (
      (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
      OR student_id IN (SELECT id FROM students WHERE user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS messages_insert ON messages;
CREATE POLICY messages_insert ON messages
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS messages_delete ON messages;
CREATE POLICY messages_delete ON messages
  FOR DELETE TO authenticated
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );

-- ── broadcasts: admin only ──
DROP POLICY IF EXISTS broadcasts_select ON broadcasts;
CREATE POLICY broadcasts_select ON broadcasts
  FOR SELECT TO authenticated
  USING (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS broadcasts_insert ON broadcasts;
CREATE POLICY broadcasts_insert ON broadcasts
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (SELECT school_id FROM users WHERE id = auth.uid())
    AND (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );
