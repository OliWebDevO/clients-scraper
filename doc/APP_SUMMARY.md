# Clients & Jobs Scraper - App Summary

## Overview

A Next.js 14+ application for scraping potential clients (businesses without websites) from Google Maps and job offers from Belgian job platforms. Features a dark, modern UI with automated scheduling and email outreach capabilities.

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| Next.js 16 | Framework (App Router) |
| TypeScript | Type safety |
| Tailwind CSS | Styling |
| shadcn/ui | UI components |
| Supabase | PostgreSQL database |
| Puppeteer | Browser automation (Google Maps) |
| Cheerio | HTML parsing (job sites) |
| Resend | Email sending |
| Vercel Cron | Scheduled tasks |

---

## Project Structure

```
clients-scraper/
├── app/
│   ├── layout.tsx              # Root layout with sidebar
│   ├── page.tsx                # Dashboard
│   ├── clients/
│   │   └── page.tsx            # Business list & scraper
│   ├── jobs/
│   │   └── page.tsx            # Jobs list & scraper
│   ├── emails/
│   │   └── page.tsx            # Email templates
│   ├── settings/
│   │   └── page.tsx            # Schedule manager
│   └── api/
│       ├── scrape/
│       │   ├── businesses/route.ts
│       │   └── jobs/route.ts
│       ├── emails/
│       │   ├── send/route.ts
│       │   └── templates/route.ts
│       └── cron/route.ts
├── components/
│   ├── ui/                     # shadcn components
│   ├── Sidebar.tsx
│   ├── BusinessTable.tsx
│   ├── JobTable.tsx
│   ├── FilterPanel.tsx
│   ├── JobFilterPanel.tsx
│   ├── ScrapeBusinessModal.tsx
│   ├── ScrapeJobsModal.tsx
│   └── SendEmailModal.tsx
├── lib/
│   ├── supabase.ts             # Database client
│   ├── resend.ts               # Email client
│   ├── types.ts                # TypeScript types
│   ├── utils.ts                # Utility functions
│   └── scrapers/
│       ├── base.ts             # Base scraper class
│       ├── index.ts            # Scraper factory
│       ├── google-maps.ts      # Puppeteer scraper
│       ├── ictjob.ts
│       ├── indeed.ts
│       ├── jobat.ts
│       ├── actiris.ts
│       ├── jobsora.ts
│       └── linkedin.ts
├── hooks/
│   └── use-toast.ts
├── doc/
│   ├── IMPLEMENTATION_PLAN.md
│   ├── APP_SUMMARY.md
│   └── supabase-schema.sql
├── .env.local                  # Environment variables
├── vercel.json                 # Cron configuration
└── package.json
```

---

## Features

### 1. Dashboard (`/`)
- Summary cards: total clients, jobs, emails sent, last scrape
- Quick action buttons
- Recent activity feed

### 2. Clients Page (`/clients`)
- Data table with all scraped businesses
- Filters: search, rating, category, website status
- Scrape modal: location, radius, min rating, categories
- Send email action per business
- Export to CSV

### 3. Jobs Page (`/jobs`)
- Data table with all job listings
- Filters: search, source platform, keyword, date range
- Scrape modal: select platforms, keywords, location
- Export to CSV

### 4. Emails Page (`/emails`)
- Create/edit/delete email templates
- Variable support: `{{business_name}}`, `{{city}}`, etc.
- Live preview with sample data
- Sent emails history

### 5. Settings Page (`/settings`)
- Create scheduled scrapes (daily/weekly)
- Enable/disable schedules
- Configure platforms, keywords, locations
- View next run time

---

## Supported Job Platforms

| Platform | URL | Method |
|----------|-----|--------|
| ICTJob.be | ictjob.be | Cheerio |
| Indeed | be.indeed.com | Cheerio |
| Jobat | jobat.be | Cheerio |
| Actiris | actiris.brussels | Cheerio |
| Jobsora | jobsora.com/be | Cheerio |
| LinkedIn | linkedin.com/jobs | Cheerio (limited) |

---

## Database Schema

### Tables

| Table | Description |
|-------|-------------|
| `businesses` | Scraped businesses (name, address, rating, etc.) |
| `jobs` | Job listings (title, company, source, etc.) |
| `scrape_logs` | History of scrape runs |
| `scrape_schedules` | Automated schedule configurations |
| `email_templates` | Reusable email templates |
| `sent_emails` | Tracking of sent emails |
| `settings` | App preferences |

---

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Resend
RESEND_API_KEY=

# Cron (optional)
CRON_SECRET=
```

---

## Getting Started

### 1. Set up Supabase

1. Create a new Supabase project
2. Go to SQL Editor
3. Run the schema from `doc/supabase-schema.sql`
4. Copy your project URL and keys

### 2. Configure Environment

```bash
cp .env.local.example .env.local
# Edit .env.local with your credentials
```

### 3. Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## API Endpoints

### Scraping

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/scrape/businesses` | Scrape Google Maps |
| POST | `/api/scrape/jobs` | Scrape job platforms |
| GET | `/api/cron` | Run due schedules |

### Emails

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/emails/templates` | List templates |
| POST | `/api/emails/templates` | Create template |
| PUT | `/api/emails/templates` | Update template |
| DELETE | `/api/emails/templates?id=` | Delete template |
| POST | `/api/emails/send` | Send email |

---

## Scraper Request Examples

### Scrape Businesses
```json
POST /api/scrape/businesses
{
  "location": "Brussels, Belgium",
  "radius": 10,
  "minRating": 3,
  "categories": ["restaurants", "retail"]
}
```

### Scrape Jobs
```json
POST /api/scrape/jobs
{
  "platforms": ["ictjob", "indeed", "jobat"],
  "keywords": ["web developer", "react developer"],
  "location": "Belgium"
}
```

---

## Deployment

### Vercel

1. Push to GitHub
2. Import in Vercel
3. Add environment variables
4. Deploy

Cron jobs are configured in `vercel.json` to run hourly.

---

## Notes

- **Rate Limiting**: Scrapers include 2-5 second delays between requests
- **LinkedIn**: May be blocked due to anti-bot measures
- **Google Maps**: Uses Puppeteer; may need adjustment if Google changes their UI
- **Resend Free Tier**: 3,000 emails/month
- **Supabase Free Tier**: 500MB database, 2GB bandwidth

---

## Future Improvements

- [ ] Add pagination to tables
- [ ] Implement bulk email sending
- [ ] Add email open tracking
- [ ] Google Places API fallback
- [ ] More detailed job descriptions
- [ ] Business phone number extraction
- [ ] Dark/light theme toggle
