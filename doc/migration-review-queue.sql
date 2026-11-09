-- Migration: review queue — automatic emails are prepared, checked by AI, and wait for approval
-- Run once in the Supabase SQL Editor. Safe to re-run. Deletes nothing.

CREATE TABLE IF NOT EXISTS outreach_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'first',        -- 'first' | 'followup'
  status TEXT NOT NULL DEFAULT 'pending',    -- 'pending' | 'approved' | 'sent' | 'rejected' | 'failed'
  checks JSONB,                              -- { errors: [], warnings: [] }
  ai_review JSONB,                           -- { verdict, problems: [], suggestions: [] }
  error_message TEXT,
  resend_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_outreach_queue_status ON outreach_queue(status, created_at);
CREATE INDEX IF NOT EXISTS idx_outreach_queue_business ON outreach_queue(business_id);

-- Server-side only (service role), like every other table since migration-security.sql
ALTER TABLE outreach_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON outreach_queue FROM anon, authenticated;

-- Review mode is ON by default: nothing automatic leaves without your approval
UPDATE settings
SET value = value || '{"review_before_send": true}'::jsonb
WHERE key = 'daily_outreach' AND NOT (value ? 'review_before_send');
