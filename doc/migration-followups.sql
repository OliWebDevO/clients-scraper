-- Migration: automatic follow-ups
-- Run once in the Supabase SQL Editor (after migration-prospecting.sql). Safe to re-run. Deletes nothing.

-- The prospect answered: never send them an automatic follow-up
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS replied BOOLEAN NOT NULL DEFAULT false;

-- From KBO: true = company (legal person), false = sole trader (natural person: no unsolicited email)
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS legal_person BOOLEAN;

-- 'first' = first contact, 'followup' = automatic follow-up
ALTER TABLE sent_emails
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'first';

CREATE INDEX IF NOT EXISTS idx_sent_emails_kind_sent_at ON sent_emails(kind, sent_at);

-- Follow-ups and the daily 8:00 send are OFF until switched on in Settings
INSERT INTO settings (key, value)
VALUES ('followups', '{"enabled": false, "delay_days": 5}')
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value)
VALUES ('daily_outreach', '{"enabled": false, "hour": 8, "kbo_count": 15, "google_count": 5}')
ON CONFLICT (key) DO NOTHING;
