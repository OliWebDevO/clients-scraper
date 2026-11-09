-- Security migration: the public anon key gets NO access to the data.
-- The browser now reads through the session-protected proxy /api/db (app/api/db/rest/v1/[table]/route.ts),
-- and every server route uses the service-role key, which bypasses RLS.
--
-- ORDER: deploy the code containing /api/db FIRST, then run this file in the Supabase SQL editor.
-- (Running it before the deploy blanks the clients / jobs / emails pages until the deploy.)

DROP POLICY IF EXISTS "anon_select_businesses" ON businesses;
DROP POLICY IF EXISTS "anon_select_jobs" ON jobs;
DROP POLICY IF EXISTS "anon_select_scrape_logs" ON scrape_logs;
DROP POLICY IF EXISTS "anon_select_scrape_schedules" ON scrape_schedules;
DROP POLICY IF EXISTS "anon_select_settings" ON settings;
DROP POLICY IF EXISTS "anon_select_email_templates" ON email_templates;
DROP POLICY IF EXISTS "anon_select_sent_emails" ON sent_emails;
DROP POLICY IF EXISTS "anon_select_user_documents" ON user_documents;
DROP POLICY IF EXISTS "anon_select_job_drafts" ON job_drafts;
DROP POLICY IF EXISTS "anon_select_business_drafts" ON business_drafts;

-- Defense in depth: no table privileges for the API roles the app never uses (RLS stays enabled)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- Tables created later must not get anon/authenticated grants automatically either
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

-- Check (should return 0 rows for both):
--   SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' AND 'anon' = ANY(roles) AND policyname <> 'deny_anon_app_users';
--   SELECT table_name, privilege_type FROM information_schema.role_table_grants WHERE grantee = 'anon' AND table_schema = 'public';
