-- Migration: prospecting improvements (emails, opt-outs, KBO import)
-- Run once in the Supabase SQL Editor. Safe to re-run. Does NOT delete any data.

-- 1. New business columns
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS email TEXT,                          -- found on the website, or last address emailed
  ADD COLUMN IF NOT EXISTS do_not_contact BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'google_maps',   -- 'google_maps' | 'kbo'
  ADD COLUMN IF NOT EXISTS kbo_number TEXT,                     -- Belgian company number (BCE/KBO)
  ADD COLUMN IF NOT EXISTS company_start_date DATE;             -- from KBO

-- Plain (non-partial) unique index so the KBO import can upsert on it; NULLs never conflict in Postgres
CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_kbo_number ON businesses(kbo_number);
CREATE INDEX IF NOT EXISTS idx_businesses_source ON businesses(source);
CREATE INDEX IF NOT EXISTS idx_businesses_company_start_date ON businesses(company_start_date);

-- 2. Opt-out list, kept by email address (survives re-scrapes and duplicates)
CREATE TABLE IF NOT EXISTS email_optouts (
  email TEXT PRIMARY KEY,          -- always stored lowercase
  reason TEXT,                     -- 'manual', 'reply-stop', …
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Same access model as the other tables: server-side service role only
ALTER TABLE email_optouts ENABLE ROW LEVEL SECURITY;
