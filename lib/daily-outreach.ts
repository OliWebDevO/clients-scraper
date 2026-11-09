/**
 * Daily automatic first contacts (server only).
 * - KBO: recently created COMPANIES only (legal persons may be emailed without prior consent; sole traders may not)
 * - Google Maps: no real website or an outdated one, email on the business' own domain (generic address),
 *   ranked by the reply rate of their sector, then rating and number of reviews
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlatform, getWebsiteProfile } from "./prospect";
import { analyzeWebsite, pickEmail } from "./website-analyzer";

export interface DailyOutreachSettings {
  enabled: boolean;
  hour: number; // Brussels time
  kbo_count: number;
  google_count: number;
  last_run_date?: string; // YYYY-MM-DD, Brussels
  last_result?: { kbo: number; google: number; skipped: number };
}

export const DEFAULT_DAILY_SETTINGS: DailyOutreachSettings = { enabled: false, hour: 8, kbo_count: 15, google_count: 5 };

export const CANDIDATE_FIELDS =
  "id, name, rating, review_count, category, address, has_website, website_url, website_score, website_issues, email, source, company_start_date, legal_person";

export interface Candidate {
  id: string;
  name: string;
  rating: number | null;
  review_count: number | null;
  category: string | null;
  address: string | null;
  has_website: boolean;
  website_url: string | null;
  website_score: number | null;
  website_issues: string[] | null;
  email: string | null;
  source: string | null;
  company_start_date: string | null;
  legal_person: boolean | null;
}

const KBO_MAX_AGE_DAYS = 365; // "félicitations pour le lancement" stays true for a year
const EMAIL_LOOKUPS_PER_RUN = 15;

/** Email on the business' own website domain (info@salon.be), not a personal mailbox */
export function isOwnDomainEmail(email: string, websiteUrl: string | null): boolean {
  if (!websiteUrl) return false;
  try {
    const host = new URL(websiteUrl).hostname.replace(/^www\./, "").toLowerCase();
    const domain = email.split("@")[1]?.toLowerCase() ?? "";
    return domain === host || domain.endsWith(`.${host}`) || host.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}

export function brusselsDate(date = new Date()): { day: string; hour: number } {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(date); // YYYY-MM-DD
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", hour: "numeric", hour12: false }).format(date));
  return { day, hour };
}

/** Never contacted, not opted out */
async function excludedIds(supabase: SupabaseClient): Promise<{ contacted: Set<string>; optedOut: Set<string> }> {
  const [{ data: sent }, { data: optOuts }] = await Promise.all([
    supabase.from("sent_emails").select("business_id").not("business_id", "is", null).limit(10000),
    supabase.from("email_optouts").select("email").limit(10000),
  ]);
  return {
    contacted: new Set((sent || []).map((s) => s.business_id as string)),
    optedOut: new Set((optOuts || []).map((o) => o.email as string)),
  };
}

/** Reply rate per category, smoothed so a sector with 1 reply out of 1 doesn't jump to the top */
async function sectorReplyRates(supabase: SupabaseClient): Promise<(category: string | null) => number> {
  const { data: sent } = await supabase
    .from("sent_emails")
    .select("business_id, businesses(category, replied)")
    .eq("kind", "first")
    .not("business_id", "is", null)
    .limit(10000);
  const stats = new Map<string, { sent: number; replied: number }>();
  let total = 0;
  let replies = 0;
  for (const row of sent || []) {
    const b = (Array.isArray(row.businesses) ? row.businesses[0] : row.businesses) as { category: string | null; replied: boolean } | null;
    const key = (b?.category || "").toLowerCase();
    const s = stats.get(key) || { sent: 0, replied: 0 };
    s.sent++;
    total++;
    if (b?.replied) {
      s.replied++;
      replies++;
    }
    stats.set(key, s);
  }
  const prior = total ? replies / total : 0.05;
  const weight = 5;
  return (category) => {
    const s = stats.get((category || "").toLowerCase());
    return s ? (s.replied + weight * prior) / (s.sent + weight) : prior;
  };
}

export async function selectKboCandidates(supabase: SupabaseClient, limit: number): Promise<Candidate[]> {
  const since = new Date(Date.now() - KBO_MAX_AGE_DAYS * 86400000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("businesses")
    .select(CANDIDATE_FIELDS)
    .eq("source", "kbo")
    .eq("legal_person", true)
    .eq("do_not_contact", false)
    .eq("replied", false)
    .not("email", "is", null)
    .gte("company_start_date", since)
    .order("company_start_date", { ascending: false })
    .limit(500);
  const { contacted, optedOut } = await excludedIds(supabase);
  return ((data || []) as Candidate[])
    .filter((b) => !contacted.has(b.id) && !optedOut.has(b.email!.toLowerCase()))
    .slice(0, limit);
}

/**
 * Google Maps prospects. With `lookupEmails`, missing emails are first searched on the websites
 * of the best-ranked prospects (and saved), so the pool fills up on its own.
 */
export async function selectGoogleCandidates(
  supabase: SupabaseClient,
  limit: number,
  { lookupEmails = false } = {}
): Promise<Candidate[]> {
  const { data } = await supabase
    .from("businesses")
    .select(CANDIDATE_FIELDS)
    .eq("source", "google_maps")
    .eq("do_not_contact", false)
    .eq("replied", false)
    .not("rating", "is", null)
    .limit(2000);
  const { contacted, optedOut } = await excludedIds(supabase);
  const replyRate = await sectorReplyRates(supabase);

  const pool = ((data || []) as Candidate[])
    .filter((b) => !contacted.has(b.id))
    .filter((b) => {
      const profile = getWebsiteProfile({ hasWebsite: b.has_website, websiteUrl: b.website_url, websiteScore: b.website_score });
      return profile !== "ok"; // no site, social/booking page only, or outdated site
    })
    .sort(
      (a, b) =>
        replyRate(b.category) - replyRate(a.category) ||
        (b.rating ?? 0) - (a.rating ?? 0) ||
        (b.review_count ?? 0) - (a.review_count ?? 0)
    );

  const picked: Candidate[] = [];
  let lookups = 0;
  for (const b of pool) {
    if (picked.length >= limit) break;
    // Fill a missing email from the business' own website
    if (!b.email && lookupEmails && lookups < EMAIL_LOOKUPS_PER_RUN && b.website_url && !getPlatform(b.website_url)) {
      lookups++;
      const analysis = await analyzeWebsite(b.website_url);
      const email = analysis ? pickEmail(analysis.emails, analysis.url) : null;
      if (email) {
        b.email = email;
        await supabase.from("businesses").update({ email }).eq("id", b.id);
      }
    }
    if (!b.email || optedOut.has(b.email.toLowerCase())) continue;
    if (!isOwnDomainEmail(b.email, b.website_url)) continue; // generic business address only
    picked.push(b);
  }
  return picked;
}
