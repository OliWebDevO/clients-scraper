-- Migration: Add website analysis fields to businesses table
-- Run this SQL in your Supabase SQL Editor

-- 1. Supprimer tous les anciens business (repartir de zéro)
DELETE FROM sent_emails WHERE business_id IS NOT NULL;
DELETE FROM businesses;

-- 2. Add new columns for website analysis
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS website_url TEXT,
ADD COLUMN IF NOT EXISTS website_score INTEGER, -- 0-100, higher = worse site = better prospect
ADD COLUMN IF NOT EXISTS website_issues TEXT[]; -- Array of detected issues

-- 3. Index for filtering by website score
CREATE INDEX IF NOT EXISTS idx_businesses_website_score ON businesses(website_score);

-- Comment explaining the score
COMMENT ON COLUMN businesses.website_score IS 'Technical quality score: 0-100, higher = worse site = better sales prospect. NULL means no website or not analyzed.';
