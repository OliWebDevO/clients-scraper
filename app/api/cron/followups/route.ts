import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { verifyCronSecret } from "@/lib/cron-auth";
import { checkEmail } from "@/lib/email-checks";
import { cleanBusinessName, getCity } from "@/lib/prospect";
import {
  DEFAULT_FOLLOWUP_SETTINGS,
  generateFollowUpEmail,
  isBrusselsWorkingHour,
  type FollowUpSettings,
} from "@/lib/outreach";
import { queueEmail, queuedBusinessIds, autoCorrectAndSend } from "@/lib/outreach-queue";
import { DEFAULT_DAILY_SETTINGS, type DailyOutreachSettings } from "@/lib/daily-outreach";

export const maxDuration = 300;

const MAX_PER_RUN = 8; // called hourly → at most ~64 follow-ups per working day
const GAP_MS = 20_000; // spread sends: bursts hurt deliverability
const MAX_AGE_DAYS = 30; // never follow up on old campaigns
const MARKER = /^__HTML_/; // first email was a designed HTML template: no plain text to quote

/** Hourly: one automatic follow-up for first emails that got no reply */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  const { data: setting } = await supabase.from("settings").select("value").eq("key", "followups").maybeSingle();
  const config: FollowUpSettings = { ...DEFAULT_FOLLOWUP_SETTINGS, ...(setting?.value as Partial<FollowUpSettings> | undefined) };
  if (!config.enabled) return NextResponse.json({ success: true, message: "Follow-ups disabled", sent: 0 });
  if (!isBrusselsWorkingHour()) return NextResponse.json({ success: true, message: "Outside working hours", sent: 0 });

  const now = Date.now();
  const dueBefore = new Date(now - config.delay_days * 86400000).toISOString();
  const notOlderThan = new Date(now - MAX_AGE_DAYS * 86400000).toISOString();

  // First emails old enough to follow up on
  const { data: firsts, error } = await supabase
    .from("sent_emails")
    .select("business_id, recipient_email, subject, body, sent_at")
    .eq("kind", "first")
    .eq("status", "sent")
    .not("business_id", "is", null)
    .lte("sent_at", dueBefore)
    .gte("sent_at", notOlderThan)
    .order("sent_at", { ascending: false })
    .limit(300);
  if (error) {
    console.error("Follow-ups query error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  if (!firsts?.length) return NextResponse.json({ success: true, message: "Nothing due", sent: 0 });

  // Latest first email per business
  const latestByBusiness = new Map<string, (typeof firsts)[number]>();
  for (const e of firsts) if (!latestByBusiness.has(e.business_id)) latestByBusiness.set(e.business_id, e);
  const ids = [...latestByBusiness.keys()];

  // Same review switch as the daily send: follow-ups wait on the "À valider" page too
  const { data: dailySetting } = await supabase.from("settings").select("value").eq("key", "daily_outreach").maybeSingle();
  const review =
    ({ ...DEFAULT_DAILY_SETTINGS, ...(dailySetting?.value as Partial<DailyOutreachSettings> | undefined) }).review_before_send !== false;
  const queuedFollowups = await queuedBusinessIds(supabase, "followup");

  const [{ data: followed }, { data: businesses }, { data: optOuts }] = await Promise.all([
    supabase.from("sent_emails").select("business_id").eq("kind", "followup").in("business_id", ids),
    supabase.from("businesses").select("id, name, address, source, replied, do_not_contact").in("id", ids),
    supabase.from("email_optouts").select("email").in("email", [...latestByBusiness.values()].map((e) => e.recipient_email)),
  ]);
  const alreadyFollowed = new Set((followed || []).map((f) => f.business_id));
  const optedOut = new Set((optOuts || []).map((o) => o.email));
  const businessById = new Map((businesses || []).map((b) => [b.id, b]));

  const results: Array<{ business: string; status: string }> = [];
  for (const [businessId, first] of latestByBusiness) {
    if (results.filter((r) => r.status === "sent").length >= MAX_PER_RUN) break;
    const business = businessById.get(businessId);
    if (!business || business.replied || business.do_not_contact) continue;
    if (alreadyFollowed.has(businessId) || queuedFollowups.has(businessId) || optedOut.has(first.recipient_email)) continue;

    const { subject, body } = generateFollowUpEmail({
      businessName: business.name,
      address: business.address,
      source: business.source,
      originalSubject: first.subject,
      originalBody: first.body && !MARKER.test(first.body) ? first.body : null,
      originalSentAt: first.sent_at,
    });
    const check = checkEmail({ subject, text: body, businessName: business.name });
    if (check.errors.length) {
      results.push({ business: business.name, status: `skipped: ${check.errors.join(" ")}` });
      continue;
    }

    if (review) {
      try {
        await queueEmail(supabase, {
          businessId,
          recipientEmail: first.recipient_email,
          subject,
          body,
          kind: "followup",
          businessName: business.name,
          location: business.address,
        });
        results.push({ business: business.name, status: "sent" }); // counts toward MAX_PER_RUN
      } catch (err) {
        console.error(`Follow-up queue failed for ${business.name}:`, err);
        results.push({ business: business.name, status: "failed" });
      }
      continue;
    }
    // Direct mode: AI corrects the phrasing, then it is sent (doubtful ones go to "À valider")
    if (results.some((r) => r.status === "sent")) await new Promise((r) => setTimeout(r, GAP_MS));
    try {
      const outcome = await autoCorrectAndSend(supabase, {
        businessId,
        recipientEmail: first.recipient_email,
        subject,
        body,
        kind: "followup",
        businessName: business.name,
        displayName: cleanBusinessName(business.name, getCity(business.address)),
        location: business.address,
        lockSubject: true,
      });
      results.push({ business: business.name, status: outcome === "sent" ? "sent" : "queued" });
    } catch (err) {
      console.error(`Follow-up failed for ${business.name}:`, err);
      results.push({ business: business.name, status: "failed" });
    }
  }

  return NextResponse.json({ success: true, sent: results.filter((r) => r.status === "sent").length, results });
}
