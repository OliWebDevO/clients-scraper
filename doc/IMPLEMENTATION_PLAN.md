# Clients & Jobs Scraper - Implementation Plan

## Overview
A Next.js application to scrape potential clients (businesses without websites) from Google Maps and job offers from multiple Belgian job platforms.

---

## Tech Stack
- **Framework**: Next.js 14+ (App Router)
- **Database**: Supabase (PostgreSQL)
- **Styling**: Tailwind CSS + shadcn/ui components
- **Scraping**: Puppeteer (for sites requiring JS rendering) + Cheerio (for static HTML)
- **Scheduling**: Vercel Cron Jobs (checks DB for due tasks) + Manual triggers via UI
- **Email**: Resend API for sending outreach emails

---

## Features

### 1. Client Scraper (Google Maps Businesses)
**Goal**: Find businesses with good reviews but no website

- **Configurable location** (city + radius in km)
- **All business categories** (restaurants, local services, retail, etc.)
- **Filters** (all configurable in UI):
  - Minimum rating (default: 3+ stars)
  - Minimum reviews count
  - No website detected
- **Data collected**:
  - Business name, address, phone
  - Rating, review count
  - Category
  - Google Maps link

**Approach**: Web scraping with Puppeteer first (free). If too unreliable, can switch to Google Places API later (free tier: ~6,000 searches/month).

### 2. Job Scraper
**Platforms**:
| Platform | URL | Difficulty |
|----------|-----|------------|
| LinkedIn | linkedin.com/jobs | Hard (anti-bot, will try) |
| Indeed | be.indeed.com | Medium |
| ICTJob.be | ictjob.be | Easy |
| Jobat | jobat.be | Easy |
| Actiris | actiris.brussels | Medium |
| Jobsora | jobsora.com/be | Easy |

**Keywords** (EN + FR):
- web developer / développeur web
- front-end developer / développeur front-end
- wordpress developer / développeur wordpress
- junior developer / développeur junior
- react developer / développeur react

**Data collected**:
- Job title, company, location
- Salary (if available)
- Posted date
- Link to original posting
- Source platform

### 3. Email Outreach System
**Goal**: Send prospecting emails to scraped businesses

- **Email Templates**:
  - Create/edit/delete pre-made email templates in the UI
  - Use variables: `{{business_name}}`, `{{owner_name}}`, `{{city}}`, etc.
  - Preview template with sample data before saving

- **Sending Options**:
  - From business list: select one or multiple businesses → send email
  - Choose between:
    - Pre-made template (select from list)
    - Custom personalized email (write on the spot)
  - Preview before sending

- **Tracking**:
  - Track which businesses received emails
  - Track email status (sent, delivered, opened if Resend supports)
  - Avoid duplicate sends to same business

- **Provider**: Resend API (free tier: 3,000 emails/month)

---

## Database Schema (Supabase)

```sql
-- Businesses (potential clients)
CREATE TABLE businesses (
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
CREATE TABLE jobs (
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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scrape history
CREATE TABLE scrape_logs (
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
CREATE TABLE scrape_schedules (
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
CREATE TABLE settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email templates
CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL, -- supports {{variables}}
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sent emails tracking
CREATE TABLE sent_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id),
  template_id UUID REFERENCES email_templates(id),
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT DEFAULT 'sent', -- 'sent', 'delivered', 'opened', 'failed'
  resend_id TEXT, -- ID from Resend API
  sent_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Project Structure

```
/clients-scraper
├── app/
│   ├── layout.tsx
│   ├── page.tsx                    # Dashboard
│   ├── clients/
│   │   └── page.tsx                # Clients list + scraper controls
│   ├── jobs/
│   │   └── page.tsx                # Jobs list + scraper controls
│   ├── settings/
│   │   └── page.tsx                # Scheduling + preferences
│   ├── emails/
│   │   ├── page.tsx                # Email templates list
│   │   └── [id]/page.tsx           # Edit template
│   ├── api/
│   │   ├── scrape/
│   │   │   ├── businesses/route.ts # Business scraper endpoint
│   │   │   └── jobs/route.ts       # Jobs scraper endpoint
│   │   ├── schedules/
│   │   │   └── route.ts            # CRUD for schedules
│   │   ├── emails/
│   │   │   ├── send/route.ts       # Send email via Resend
│   │   │   └── templates/route.ts  # CRUD for templates
│   │   └── cron/
│   │       └── route.ts            # Cron checks DB for due schedules
├── components/
│   ├── ui/                         # shadcn components
│   ├── BusinessTable.tsx
│   ├── JobTable.tsx
│   ├── ScraperControls.tsx
│   ├── FilterPanel.tsx
│   ├── ScheduleManager.tsx         # UI to create/edit schedules
│   ├── SettingsForm.tsx            # Default preferences form
│   ├── EmailTemplateEditor.tsx     # Create/edit email templates
│   ├── SendEmailModal.tsx          # Modal to send email to business
│   └── EmailHistory.tsx            # View sent emails for a business
├── lib/
│   ├── supabase.ts                 # Supabase client
│   ├── resend.ts                   # Resend email client
│   ├── scrapers/
│   │   ├── google-maps.ts
│   │   ├── linkedin.ts
│   │   ├── indeed.ts
│   │   ├── ictjob.ts
│   │   ├── jobat.ts
│   │   ├── actiris.ts
│   │   └── jobsora.ts
│   └── utils.ts
├── .env.local                      # API keys
└── vercel.json                     # Cron config
```

---

## UI Pages

### Dashboard (/)
- Summary cards: total clients found, total jobs, last scrape time
- Quick actions to trigger scrapes
- Recent activity feed

### Clients Page (/clients)
- Table with all scraped businesses
- Filters: location, rating, category
- Export to CSV
- "Start Scrape" button with config modal:
  - Location input (city/address)
  - Radius (km)
  - Minimum rating
  - Categories to search
- **Email actions** (per row or bulk):
  - "Send Email" button → opens modal to:
    - Select pre-made template OR write custom email
    - Preview with business data filled in
    - Send via Resend
  - Email status indicator (not contacted / contacted / replied)
  - View email history for each business

### Jobs Page (/jobs)
- Table with all job listings
- Filters: source, keywords, date range, location
- Export to CSV
- "Start Scrape" button with config modal:
  - Select platforms to scrape
  - Keywords to search
  - Location filter

### Emails Page (/emails)
- List of all email templates
- Create new template button
- Edit/delete existing templates
- Template editor with:
  - Name, subject, body fields
  - Variable insertion: `{{business_name}}`, `{{city}}`, etc.
  - Live preview with sample data
- View sent email history

### Settings Page (/settings)
- **Schedule Manager**:
  - Create/edit/delete scheduled scrapes
  - Toggle schedules on/off
  - Set frequency: daily, weekly, or custom
  - Set time of day to run
  - Configure what to scrape (platforms, keywords, locations)
  - View next scheduled run time
- **Default Filters**:
  - Default minimum rating for businesses (3+ stars)
  - Default keywords for job searches
  - Default location/radius

---

## Implementation Phases

### Phase 1: Project Setup
1. Initialize Next.js project with TypeScript
2. Set up Tailwind CSS + shadcn/ui
3. Create Supabase project and tables
4. Configure environment variables

### Phase 2: Core UI
1. Build dashboard layout
2. Create data tables (businesses + jobs)
3. Add filter panels
4. Build scraper control modals

### Phase 3: Job Scrapers
1. Implement ICTJob.be scraper (easiest, good for testing)
2. Implement Indeed scraper
3. Implement Jobat scraper
4. Implement Actiris scraper
5. Implement Jobsora scraper
6. Implement LinkedIn scraper (most complex, may need workarounds)

### Phase 4: Business Scraper
1. Research Google Maps scraping approach
2. Implement business scraper
3. Add website detection logic

### Phase 5: Email Outreach System
1. Set up Resend integration
2. Build email templates CRUD (Emails page)
3. Build template editor with variable support
4. Add "Send Email" modal to Clients page
5. Track sent emails and display status

### Phase 6: Scheduling & Polish
1. Build Settings page with Schedule Manager UI
2. Set up Vercel Cron that checks `scrape_schedules` table
3. Add export functionality (CSV)
4. Add notification/alerts for new items
5. Error handling and retry logic

---

## Important Considerations

### Legal/Ethical
- **LinkedIn**: Heavily protected, may need to use their official API or skip
- **Google Maps**: Google Places API is the legal option ($17/1000 requests)
- **Other sites**: Respect robots.txt, add delays between requests

### Technical Challenges
- Anti-bot detection (especially LinkedIn, Indeed)
- Rate limiting
- Data deduplication
- Keeping scrapers updated when sites change

### How UI-Managed Scheduling Works
1. User creates schedules in Settings page (e.g., "Run job scraper daily at 9am")
2. Schedules are stored in `scrape_schedules` table with `next_run_at` timestamp
3. Vercel Cron runs every hour (or more frequently) and calls `/api/cron`
4. Cron endpoint queries `scrape_schedules` for any schedules where `next_run_at <= now`
5. For each due schedule, it runs the appropriate scraper
6. After completion, updates `last_run_at` and calculates new `next_run_at`

This way, users control everything via UI - no need to edit code or config files.

### Decisions Made
1. **All scraping via web scraping** (Puppeteer + Cheerio) - no paid APIs initially
2. **Google Maps**: Try scraping first; switch to Places API (free tier) if unreliable
3. **LinkedIn**: Include it, but expect limitations - can disable if too problematic
4. **Job platforms**: Indeed, ICTJob, Jobat, Actiris, Jobsora, LinkedIn
5. Add generous delays (2-5 seconds) between requests to avoid blocks

---

## Environment Variables Needed

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Google (optional, only if switching to Places API later)
GOOGLE_PLACES_API_KEY=

# Resend (for sending emails)
RESEND_API_KEY=

# Cron secret (for scheduled scraping)
CRON_SECRET=
```

---

## Verification

After implementation:
1. Run `npm run dev` and verify dashboard loads
2. Test each scraper individually via UI
3. Verify data is saved to Supabase
4. Test filters and export functionality
5. Create an email template and verify variables work
6. Send a test email to yourself and verify delivery
7. Test cron endpoint manually
8. Test schedule creation and verify it triggers at configured time
