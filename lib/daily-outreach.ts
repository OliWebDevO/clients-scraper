/**
 * Daily automatic first contacts (server only).
 * - KBO: recently created COMPANIES only (legal persons may be emailed without prior consent; sole traders may not)
 * - Google Maps: no real website or an outdated one, email on the business' own domain (generic address),
 *   ranked by the reply rate of their sector, then rating and number of reviews
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlatform, getWebsiteProfile, GOOD_WEBSITE_SCORE } from "./prospect";
import { analyzeWebsite, pickEmail } from "./website-analyzer";
import { queuedBusinessIds } from "./outreach-queue";

export interface DailyOutreachSettings {
  enabled: boolean;
  hour: number; // Brussels time
  kbo_count: number;
  google_count: number;
  review_before_send?: boolean; // default true: emails wait on the "À valider" page
  last_run_date?: string; // YYYY-MM-DD, Brussels
  last_result?: { kbo: number; google: number; skipped: number; queued?: number };
}

export const DEFAULT_DAILY_SETTINGS: DailyOutreachSettings = { enabled: false, hour: 8, kbo_count: 15, google_count: 5, review_before_send: true };

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

/** French-speaking area only: Brussels (1000-1210) + Walloon Brabant (1300-1499). The email is in French. */
export function isFrenchSpeakingArea(address: string | null): boolean {
  const postcode = Number(address?.match(/\b(\d{4})\s+[^\d,]+(?:,\s*(?:Belgique|Belgium|België))?\s*$/i)?.[1]);
  return postcode >= 1000 && postcode <= 1499;
}

const KBO_MAX_AGE_DAYS = 365; // "félicitations pour le lancement" stays true for a year
const EMAIL_LOOKUPS_PER_RUN = 15;
const SITE_ANALYSES_PER_RUN = 40; // fresh analysis of each candidate's site at send time

/**
 * Analyse a site now (not the possibly months-old result from the scrape) and save it.
 * Returns null when the site can't be reached: we then don't email about it.
 */
async function freshAnalysis(supabase: SupabaseClient, b: Candidate): Promise<boolean> {
  const analysis = await analyzeWebsite(b.website_url!);
  if (!analysis) return false;
  b.website_score = analysis.score;
  b.website_issues = analysis.issues;
  const update: Record<string, unknown> = { website_score: analysis.score, website_issues: analysis.issues };
  if (!b.email) {
    const email = pickEmail(analysis.emails, analysis.url);
    if (email) b.email = update.email = email;
  }
  await supabase.from("businesses").update(update).eq("id", b.id);
  return true;
}

const FREE_MAILBOX = /^(gmail|googlemail|hotmail|outlook|live|msn|yahoo|icloud|me|aol|gmx|proton|protonmail|skynet|telenet|proximus|scarlet|voo|orange)\./i;

const normalize = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Impersonal business address, the only kind that may be emailed without prior consent:
 * - any address on a business domain (info@salon.be, contact@mylittlecupcoffee.com), or
 * - a free mailbox that carries the business' name (friteriechezloris@hotmail.com),
 *   not a manager's personal one (xavierdenonville@hotmail.com)
 */
export function isBusinessAddress(email: string, businessName: string): boolean {
  const [local = "", domain = ""] = email.toLowerCase().split("@");
  if (!FREE_MAILBOX.test(domain)) return true;
  const localNorm = normalize(local);
  const tokens = businessName
    .split(/[\s'’«»"&,.\-/()]+/)
    .map(normalize)
    .filter((t) => t.length >= 5 && !["srl", "sprl", "asbl", "societe", "entreprise", "generale", "services"].includes(t));
  return tokens.some((t) => localNorm.includes(t));
}

export function brusselsDate(date = new Date()): { day: string; hour: number } {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(date); // YYYY-MM-DD
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", hour: "numeric", hour12: false }).format(date));
  return { day, hour };
}

/** Never contacted (nor already waiting in the review queue), not opted out */
async function excludedIds(supabase: SupabaseClient): Promise<{ contacted: Set<string>; optedOut: Set<string> }> {
  const [{ data: sent }, { data: optOuts }, queued] = await Promise.all([
    supabase.from("sent_emails").select("business_id").not("business_id", "is", null).limit(10000),
    supabase.from("email_optouts").select("email").limit(10000),
    queuedBusinessIds(supabase),
  ]);
  return {
    contacted: new Set([...(sent || []).map((s) => s.business_id as string), ...queued]),
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

export async function selectKboCandidates(
  supabase: SupabaseClient,
  limit: number,
  { analyzeSites = false } = {}
): Promise<Candidate[]> {
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
  const pool = ((data || []) as Candidate[])
    .filter((b) => !contacted.has(b.id) && !optedOut.has(b.email!.toLowerCase()))
    .filter((b) => isBusinessAddress(b.email!, b.name) && isFrenchSpeakingArea(b.address));

  // A KBO company that already has a website: never criticise it without evidence.
  // Analyse it first; a good site or an unreachable one is skipped.
  const picked: Candidate[] = [];
  let analysed = 0;
  for (const b of pool) {
    if (picked.length >= limit) break;
    if (!b.website_url && analyzeSites && analysed < SITE_ANALYSES_PER_RUN) {
      // The KBO lists no website, but contact@company.be often has one: never tell them "it's time to get a site"
      const domain = b.email!.split("@")[1]?.toLowerCase();
      if (domain && !FREE_MAILBOX.test(domain)) {
        analysed++;
        const site = await analyzeWebsite(domain);
        if (site && !site.placeholder) {
          b.website_url = site.url;
          b.has_website = true;
          await supabase.from("businesses").update({ website_url: site.url, has_website: true }).eq("id", b.id);
        }
      }
    }
    const realSite = !!b.website_url && !getPlatform(b.website_url);
    if (realSite) {
      if (analyzeSites) {
        // Send time: analyse the site now, the email only mentions what is true today
        if (analysed >= SITE_ANALYSES_PER_RUN) continue;
        analysed++;
        if (!(await freshAnalysis(supabase, b))) continue; // unreachable
      } else if (b.website_score == null) {
        continue; // preview: never analysed yet → not counted
      }
      if ((b.website_score ?? 0) < GOOD_WEBSITE_SCORE) continue; // their site is fine
    }
    picked.push(b);
  }
  return picked;
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
    .filter((b) => !contacted.has(b.id) && isFrenchSpeakingArea(b.address))
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
  let analysed = 0;
  for (const b of pool) {
    if (picked.length >= limit) break;
    const realSite = !!b.website_url && !getPlatform(b.website_url);
    if (realSite && lookupEmails) {
      // Send time: re-analyse the site (the scrape may be months old) and fill a missing email
      if (!b.email && analysed >= EMAIL_LOOKUPS_PER_RUN) continue;
      if (analysed >= SITE_ANALYSES_PER_RUN) continue;
      analysed++;
      if (!(await freshAnalysis(supabase, b))) continue; // unreachable
      if ((b.website_score ?? 0) < GOOD_WEBSITE_SCORE) continue; // improved since the scrape: nothing to suggest
    }
    if (!b.email || optedOut.has(b.email.toLowerCase())) continue;
    if (!isBusinessAddress(b.email, b.name)) continue; // impersonal business address only
    picked.push(b);
  }
  return picked;
}
