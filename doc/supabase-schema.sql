-- Clients & Jobs Scraper - Supabase Database Schema
-- Run this SQL in your Supabase SQL Editor to create all required tables

-- Businesses (potential clients)
CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  rating DECIMAL(2,1),
  review_count INTEGER,
  category TEXT,
  google_maps_url TEXT,
  has_website BOOLEAN DEFAULT false,
  location_query TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name, address)
);

-- Job listings
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  company TEXT,
  location TEXT,
  salary TEXT,
  description TEXT,
  url TEXT UNIQUE,
  source TEXT NOT NULL,
  keywords_matched TEXT[],
  posted_at TIMESTAMPTZ,
  investigated BOOLEAN DEFAULT false,
  viable BOOLEAN DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scrape history
CREATE TABLE IF NOT EXISTS scrape_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL, -- 'businesses' or 'jobs'
  source TEXT,
  status TEXT, -- 'running', 'completed', 'failed'
  items_found INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Schedule configuration (UI-managed)
CREATE TABLE IF NOT EXISTS scrape_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'businesses' or 'jobs'
  enabled BOOLEAN DEFAULT true,
  frequency TEXT NOT NULL, -- 'daily', 'weekly', 'custom'
  time_of_day TIME DEFAULT '09:00',
  day_of_week INTEGER, -- 0-6, for weekly schedules
  config JSONB, -- stores platforms, keywords, location, etc.
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User preferences / settings
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email templates
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL, -- supports {{variables}}
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sent emails tracking
CREATE TABLE IF NOT EXISTS sent_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT DEFAULT 'sent', -- 'sent', 'delivered', 'opened', 'failed'
  resend_id TEXT, -- ID from Resend API
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- User documents (CV, cover letter)
CREATE TABLE IF NOT EXISTS user_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL, -- 'cv' or 'cover_letter'
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Job drafts (AI-generated cover letters)
CREATE TABLE IF NOT EXISTS job_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
  storage_path TEXT,
  filename TEXT,
  file_size INTEGER,
  job_description_text TEXT, -- cached scraped description
  ai_model TEXT,
  status TEXT DEFAULT 'pending', -- 'pending', 'generating', 'completed', 'failed'
  error_message TEXT,
  final_storage_path TEXT,
  final_filename TEXT,
  final_file_size INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Business drafts (AI-generated proposals)
CREATE TABLE IF NOT EXISTS business_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  storage_path TEXT,
  filename TEXT,
  file_size INTEGER,
  ai_model TEXT,
  status TEXT DEFAULT 'pending', -- 'pending', 'generating', 'completed', 'failed'
  error_message TEXT,
  final_storage_path TEXT,
  final_filename TEXT,
  final_file_size INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- App users (authentication)
CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_businesses_location ON businesses(location_query);
CREATE INDEX IF NOT EXISTS idx_businesses_rating ON businesses(rating);
CREATE INDEX IF NOT EXISTS idx_businesses_has_website ON businesses(has_website);
CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_scrape_logs_type ON scrape_logs(type);
CREATE INDEX IF NOT EXISTS idx_scrape_schedules_enabled ON scrape_schedules(enabled);
CREATE INDEX IF NOT EXISTS idx_scrape_schedules_next_run ON scrape_schedules(next_run_at);
CREATE INDEX IF NOT EXISTS idx_sent_emails_business ON sent_emails(business_id);
CREATE INDEX IF NOT EXISTS idx_job_drafts_job_id ON job_drafts(job_id);
CREATE INDEX IF NOT EXISTS idx_job_drafts_status ON job_drafts(status);
CREATE INDEX IF NOT EXISTS idx_business_drafts_business_id ON business_drafts(business_id);
CREATE INDEX IF NOT EXISTS idx_business_drafts_status ON business_drafts(status);
CREATE INDEX IF NOT EXISTS idx_businesses_investigated ON businesses(investigated);
CREATE INDEX IF NOT EXISTS idx_businesses_viable ON businesses(viable);
CREATE INDEX IF NOT EXISTS idx_jobs_investigated ON jobs(investigated);
CREATE INDEX IF NOT EXISTS idx_jobs_viable ON jobs(viable);
CREATE INDEX IF NOT EXISTS idx_sent_emails_status ON sent_emails(status);
CREATE INDEX IF NOT EXISTS idx_businesses_viable_created ON businesses(viable, created_at);
CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email);

-- =============================================================
-- Row Level Security (RLS)
-- =============================================================
-- Enable RLS on ALL tables. The service_role key (used server-side)
-- bypasses RLS automatically. Policies below grant full access to
-- the anon role so the existing client-side Supabase calls keep
-- working. Tighten these policies later when migrating all
-- client calls to server-side API routes.
-- =============================================================

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE sent_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

-- Permissive policies for the anon role (single-user app, protected by middleware auth)
-- These allow the anon key to continue working. Replace with stricter
-- policies (e.g. require a custom JWT claim) when ready.

CREATE POLICY "anon_all_businesses" ON businesses FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_jobs" ON jobs FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_scrape_logs" ON scrape_logs FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_scrape_schedules" ON scrape_schedules FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_settings" ON settings FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_email_templates" ON email_templates FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_sent_emails" ON sent_emails FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_user_documents" ON user_documents FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_job_drafts" ON job_drafts FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_business_drafts" ON business_drafts FOR ALL TO anon USING (true) WITH CHECK (true);
-- DENY all access for anon to app_users (contains password hashes)
-- Use service_role key server-side to access this table
DROP POLICY IF EXISTS "anon_all_app_users" ON app_users;
CREATE POLICY "deny_anon_app_users" ON app_users FOR ALL TO anon USING (false) WITH CHECK (false);
