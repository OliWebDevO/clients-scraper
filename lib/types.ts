export interface Business {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  rating: number | null;
  review_count: number | null;
  category: string | null;
  google_maps_url: string | null;
  has_website: boolean;
  website_url: string | null;
  website_score: number | null; // 0-100, higher = worse site = better prospect
  website_issues: string[] | null;
  location_query: string | null;
  investigated: boolean; // Mark as already looked at
  viable: boolean | null; // null = not decided, true = viable, false = not viable
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  salary: string | null;
  description: string | null;
  url: string;
  source: string;
  keywords_matched: string[];
  posted_at: string | null;
  created_at: string;
}

export interface ScrapeLog {
  id: string;
  type: "businesses" | "jobs";
  source: string | null;
  status: "running" | "completed" | "failed";
  items_found: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface ScrapeSchedule {
  id: string;
  name: string;
  type: "businesses" | "jobs";
  enabled: boolean;
  frequency: "daily" | "weekly" | "custom";
  time_of_day: string;
  day_of_week: number | null;
  config: ScheduleConfig;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
}

export interface ScheduleConfig {
  // For businesses
  location?: string;
  radius?: number;
  min_rating?: number;
  categories?: string[];
  // For jobs
  platforms?: string[];
  keywords?: string[];
  job_location?: string;
}

export interface Setting {
  id: string;
  key: string;
  value: Record<string, unknown>;
  updated_at: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface SentEmail {
  id: string;
  business_id: string;
  template_id: string | null;
  recipient_email: string;
  subject: string;
  body: string;
  status: "sent" | "delivered" | "opened" | "failed";
  resend_id: string | null;
  sent_at: string;
}

// API response types
export interface ScrapeResponse {
  success: boolean;
  message: string;
  items_found?: number;
  log_id?: string;
  error?: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

// Scraper config types
export interface BusinessScraperConfig {
  location: string;
  radius: number;
  min_rating: number;
  min_reviews?: number;
  categories?: string[];
}

export interface JobScraperConfig {
  platforms: string[];
  keywords: string[];
  location?: string;
}

// Job platform types
export type JobPlatform =
  | "linkedin"
  | "indeed"
  | "ictjob"
  | "jobat"
  | "actiris"
  | "jobsora";

export const JOB_PLATFORMS: { id: JobPlatform; name: string; url: string }[] = [
  { id: "linkedin", name: "LinkedIn", url: "linkedin.com/jobs" },
  { id: "indeed", name: "Indeed", url: "be.indeed.com" },
  { id: "ictjob", name: "ICTJob.be", url: "ictjob.be" },
  { id: "jobat", name: "Jobat", url: "jobat.be" },
  { id: "actiris", name: "Actiris", url: "actiris.brussels" },
  { id: "jobsora", name: "Jobsora", url: "jobsora.com/be" },
];

export const DEFAULT_KEYWORDS = [
  "web developer",
  "développeur web",
  "front-end developer",
  "développeur front-end",
  "wordpress developer",
  "développeur wordpress",
  "junior developer",
  "développeur junior",
  "react developer",
  "développeur react",
];

export const EMAIL_VARIABLES = [
  { key: "business_name", description: "The name of the business" },
  { key: "owner_name", description: "Owner's name (if known)" },
  { key: "city", description: "City extracted from address" },
  { key: "address", description: "Full address of the business" },
  { key: "phone", description: "Phone number" },
  { key: "category", description: "Business category" },
  { key: "rating", description: "Google rating" },
  { key: "review_count", description: "Number of reviews" },
];

// Database types for Supabase
// Using 'any' for flexibility - generate proper types with `supabase gen types typescript`
export type Database = {
  public: {
    Tables: {
      businesses: {
        Row: Business;
        Insert: Partial<Business>;
        Update: Partial<Business>;
      };
      jobs: {
        Row: Job;
        Insert: Partial<Job>;
        Update: Partial<Job>;
      };
      scrape_logs: {
        Row: ScrapeLog;
        Insert: Partial<ScrapeLog>;
        Update: Partial<ScrapeLog>;
      };
      scrape_schedules: {
        Row: ScrapeSchedule;
        Insert: Partial<ScrapeSchedule>;
        Update: Partial<ScrapeSchedule>;
      };
      settings: {
        Row: Setting;
        Insert: Partial<Setting>;
        Update: Partial<Setting>;
      };
      email_templates: {
        Row: EmailTemplate;
        Insert: Partial<EmailTemplate>;
        Update: Partial<EmailTemplate>;
      };
      sent_emails: {
        Row: SentEmail;
        Insert: Partial<SentEmail>;
        Update: Partial<SentEmail>;
      };
    };
  };
};
