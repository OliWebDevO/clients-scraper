/**
 * Daily automatic first contacts (server only).
 * - KBO: recently created COMPANIES only (legal persons may be emailed without prior consent; sole traders may not)
 * - Google Maps: no real website or an outdated one, email on the business' own domain (generic address),
 *   ranked by the reply rate of their sector, then rating and number of reviews
 */
import { lookup, resolveMx } from "node:dns/promises";
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

// KBO addresses end with the municipality. Foreign seats have 4-digit postcodes too ("1370 Logatec", Slovenia).
export const AREA_MUNICIPALITY_NAMES = [
    "Anderlecht", "Auderghem", "Berchem-Sainte-Agathe", "Bruxelles", "Etterbeek", "Evere", "Forest", "Ganshoren",
    "Ixelles", "Jette", "Koekelberg", "Molenbeek-Saint-Jean", "Saint-Gilles", "Saint-Josse-ten-Noode", "Schaerbeek",
    "Uccle", "Watermael-Boitsfort", "Woluwe-Saint-Lambert", "Woluwe-Saint-Pierre",
    "Beauvechain", "Braine-l'Alleud", "Braine-le-Château", "Chastre", "Chaumont-Gistoux", "Court-Saint-Etienne",
    "Genappe", "Grez-Doiceau", "Hélécine", "Incourt", "Ittre", "Jodoigne", "La Hulpe", "Lasne", "Mont-Saint-Guibert",
    "Nivelles", "Orp-Jauche", "Ottignies-Louvain-la-Neuve", "Perwez", "Ramillies", "Rebecq", "Rixensart", "Tubize",
    "Villers-la-Ville", "Walhain", "Waterloo", "Wavre",
];
const AREA_MUNICIPALITIES = new Set(AREA_MUNICIPALITY_NAMES.map((m) => m.toLowerCase()));

/**
 * Google Maps searches, one pair per day: trades that can pay for a site and really need their own
 * (not physios on Doctoranytime, not hairdressers with small budgets).
 */
export const GOOGLE_ROTATION_TRADES = [
  "restaurant", "bar", "café", "traiteur", "plombier", "électricien", "chauffagiste", "couvreur",
  "menuisier", "entreprise de rénovation", "carreleur", "peintre en bâtiment", "serrurier", "garage automobile",
];

/**
 * Sectors never emailed (first contact or follow-up): health professions (pharmacies excepted) are booked through
 * Doctoranytime & co or their practice.
 */
const EXCLUDED_SECTORS =
  /kin[ée]s|physio|ost[ée]o|dentist|dentaire|m[ée]decin|doctor|infirmi|logop|psycho/i;

export function isExcludedSector(category: string | null): boolean {
  return EXCLUDED_SECTORS.test(category || "");
}

/** Search n of the rotation: each trade in turn, then the next municipality */
export function googleRotationSearch(index: number): { category: string; location: string } {
  const trades = GOOGLE_ROTATION_TRADES.length;
  return {
    category: GOOGLE_ROTATION_TRADES[index % trades],
    location: `${AREA_MUNICIPALITY_NAMES[Math.floor(index / trades) % AREA_MUNICIPALITY_NAMES.length]}, Belgique`,
  };
}

/** A freshly scraped Google business the daily send could email: same rules as selectGoogleCandidates */
export async function isContactableGoogleRow(row: {
  name: string;
  address: string | null;
  email: string | null;
  rating: number | null;
  has_website: boolean;
  website_url: string | null;
  website_score: number | null;
}): Promise<boolean> {
  if (!row.email || row.rating == null || !isFrenchSpeakingArea(row.address)) return false;
  const profile = getWebsiteProfile({ hasWebsite: row.has_website, websiteUrl: row.website_url, websiteScore: row.website_score });
  if (profile === "ok") return false; // their site is fine: nothing to offer
  return isBusinessAddress(row.email, row.name) && (await canReceiveMail(row.email));
}

/** KBO company seated in a Brussels or Walloon Brabant municipality (not merely a 1000-1499 postcode abroad) */
export function isAreaMunicipality(address: string | null): boolean {
  const municipality = address?.match(/\b\d{4}\s+([^\d,]+?)\s*$/)?.[1];
  return !!municipality && AREA_MUNICIPALITIES.has(municipality.toLowerCase().replace("étienne", "etienne"));
}

const KBO_MAX_AGE_DAYS = 365; // "félicitations pour le lancement" stays true for a year
const EMAIL_LOOKUPS_PER_RUN = 15;
const SITE_ANALYSES_PER_RUN = 40; // fresh analysis of each candidate's site at send time
const SITE_PROBES_PER_RUN = 60; // KBO companies without a known site: look for one before saying "get a site"

/**
 * Analyse a site now (not the possibly months-old result from the scrape) and save it.
 * Returns false when the site can't be reached, or is in Dutch only: we then don't email about it.
 */
async function freshAnalysis(supabase: SupabaseClient, b: Candidate): Promise<boolean> {
  const analysis = await analyzeWebsite(b.website_url!);
  if (!analysis || analysis.dutchOnly || analysis.unreadable) return false;
  if (analysis.placeholder) {
    // Hosting default / "en construction" page: no real site, never critique it
    b.website_url = null;
    b.has_website = false;
    await supabase.from("businesses").update({ website_url: null, has_website: false, website_score: null, website_issues: null }).eq("id", b.id);
    return true;
  }
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

/**
 * The address can receive mail: its domain has a mail server, and it isn't a data-entry slip
 * like "renovahome01.com@renovahome01.com". A bounce hurts the sender reputation.
 */
export async function canReceiveMail(email: string): Promise<boolean> {
  const [local = "", domain = ""] = email.trim().toLowerCase().split("@");
  if (!local || !domain || local === domain) return false;
  // "Null MX" ("." or localhost, e.g. gamail.com, a typo of gmail.com): the domain accepts no mail
  return resolveMx(domain).then(
    (mx) => mx.some(({ exchange }) => exchange !== "" && exchange !== "." && exchange.toLowerCase() !== "localhost"),
    () => false
  );
}

/**
 * What a domain serves: "none" = no web address at all, "placeholder" = parked / coming soon,
 * "site" = a real site, "unknown" = resolves but can't be read today (treated as a possible site).
 */
export async function probeDomain(domain: string): Promise<{ state: "site"; url: string } | { state: "none" | "placeholder" | "unknown" }> {
  if (!domain) return { state: "none" };
  const resolves = async (host: string) => lookup(host).then(() => true, () => false);
  if (!(await resolves(domain)) && !(await resolves(`www.${domain}`))) return { state: "none" };
  const site = (await analyzeWebsite(domain)) ?? (await analyzeWebsite(`www.${domain}`));
  if (!site || site.unreadable) return { state: "unknown" };
  return site.placeholder ? { state: "placeholder" } : { state: "site", url: site.url };
}

const LEGAL_FORMS = /\b(srl|sprl|sa|sc|scs|snc|scrl|asbl|bv|nv|vzw|bvba|comm\.?\s?v)\b\.?/gi;

/** Key of the kbo_contacts lookup. Must match nameKey() in scripts/import-kbo.mjs */
export function kboNameKey(name: string): string {
  return normalize(name.replace(LEGAL_FORMS, ""));
}

/**
 * Email of a business without a website, from the KBO data (active companies only, exact name + postcode).
 * Null when not found, or when the name is shared by several companies there.
 */
export async function kboEmail(supabase: SupabaseClient, name: string, address: string | null): Promise<string | null> {
  const postcode = address?.match(/\b(\d{4})\s+[^\d,]+(?:,\s*(?:Belgique|Belgium|België))?\s*$/i)?.[1];
  const key = kboNameKey(name);
  if (!postcode || key.length < 4) return null;
  const { data } = await supabase.from("kbo_contacts").select("email").eq("postcode", postcode).eq("name_key", key).maybeSingle();
  return data?.email ?? null;
}

/** "Ryutherm SRL" → ryutherm.be, ryutherm.com */
export function guessedDomains(name: string): string[] {
  const base = normalize(name.replace(LEGAL_FORMS, ""));
  return base.length >= 4 ? [`${base}.be`, `${base}.com`] : [];
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
    .filter((b) => !contacted.has(b.id) && !optedOut.has(b.email!.toLowerCase()) && !isExcludedSector(b.category))
    .filter((b) => isBusinessAddress(b.email!, b.name) && isFrenchSpeakingArea(b.address) && isAreaMunicipality(b.address));

  // A KBO company that already has a website: never criticise it without evidence.
  // Analyse it first; a good site or an unreachable one is skipped.
  const picked: Candidate[] = [];
  let analysed = 0;
  let probes = 0;
  for (const b of pool) {
    if (picked.length >= limit) break;
    if (!b.website_url && analyzeSites) {
      // The KBO lists no website, but the company may well have one: never tell them "it's time to get a site".
      // In doubt (probe budget used up, site unreachable today), the company is skipped.
      if (probes >= SITE_PROBES_PER_RUN) continue;
      const domain = b.email!.split("@")[1]?.toLowerCase() ?? "";
      if (!FREE_MAILBOX.test(domain)) {
        // contact@company.be: look at what company.be serves
        probes++;
        const probe = await probeDomain(domain);
        if (probe.state === "unknown") continue;
        if (probe.state === "site") {
          b.website_url = probe.url;
          b.has_website = true;
          await supabase.from("businesses").update({ website_url: probe.url, has_website: true }).eq("id", b.id);
        }
      } else {
        // company@gmail.com: try the obvious domains of its name; anything that looks like a site → skip
        let maybeSite = false;
        for (const guess of guessedDomains(b.name)) {
          probes++;
          const { state } = await probeDomain(guess);
          if (state === "site" || state === "unknown") {
            maybeSite = true;
            break;
          }
        }
        if (maybeSite) continue;
      }
    }
    const realSite = !!b.website_url && !getPlatform(b.website_url);
    if (realSite) {
      if (analyzeSites) {
        // Send time: analyse the site now, the email only mentions what is true today
        if (analysed >= SITE_ANALYSES_PER_RUN) continue;
        analysed++;
        if (!(await freshAnalysis(supabase, b))) continue; // unreachable or Dutch only
      } else if (b.website_score == null) {
        continue; // preview: never analysed yet → not counted
      }
      if (b.website_url && (b.website_score ?? 0) < GOOD_WEBSITE_SCORE) continue; // their site is fine
    }
    if (!(await canReceiveMail(b.email!))) continue;
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
    .filter((b) => !contacted.has(b.id) && isFrenchSpeakingArea(b.address) && !isExcludedSector(b.category))
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
      if (!(await freshAnalysis(supabase, b))) continue; // unreachable or Dutch only
      if (b.website_url && (b.website_score ?? 0) < GOOD_WEBSITE_SCORE) continue; // improved since the scrape: nothing to suggest
    }
    if (!b.email || optedOut.has(b.email.toLowerCase())) continue;
    if (!isBusinessAddress(b.email, b.name)) continue; // impersonal business address only
    if (!(await canReceiveMail(b.email!))) continue;
    picked.push(b);
  }
  return picked;
}
