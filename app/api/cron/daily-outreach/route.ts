import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { verifyCronSecret } from "@/lib/cron-auth";
import { sendEmail } from "@/lib/resend";
import { checkEmail } from "@/lib/email-checks";
import { businessToEmailData } from "@/lib/email-html-template";
import { generateFirstContactEmail, SENDER } from "@/lib/prospect";
import { plainEmailToHtml } from "@/lib/outreach";
import {
  DEFAULT_DAILY_SETTINGS,
  brusselsDate,
  selectGoogleCandidates,
  selectKboCandidates,
  type Candidate,
  type DailyOutreachSettings,
} from "@/lib/daily-outreach";

export const maxDuration = 900;

const GAP_MS = 20_000; // spread sends: bursts hurt deliverability

/** Called hourly by the server crontab; sends once a day at the configured Brussels hour */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const { data: setting } = await supabase.from("settings").select("value").eq("key", "daily_outreach").maybeSingle();
  const config: DailyOutreachSettings = { ...DEFAULT_DAILY_SETTINGS, ...(setting?.value as Partial<DailyOutreachSettings> | undefined) };
  const { day, hour } = brusselsDate();

  if (!config.enabled) return NextResponse.json({ success: true, message: "Daily outreach disabled" });
  if (hour !== config.hour) return NextResponse.json({ success: true, message: `Runs at ${config.hour}:00 Brussels` });
  if (config.last_run_date === day) return NextResponse.json({ success: true, message: "Already ran today" });

  // Claim today's run first, so an overlapping cron call can't send twice
  await supabase.from("settings").update({ value: { ...config, last_run_date: day } }).eq("key", "daily_outreach");

  const [kbo, google] = await Promise.all([
    selectKboCandidates(supabase, config.kbo_count),
    selectGoogleCandidates(supabase, config.google_count, { lookupEmails: true }),
  ]);

  const result = { kbo: 0, google: 0, skipped: 0 };
  let first = true;
  const send = async (b: Candidate, bucket: "kbo" | "google") => {
    const { subject, body } = generateFirstContactEmail(businessToEmailData(b));
    const check = checkEmail({ subject, text: body, recipientEmail: b.email!, businessName: b.name });
    if (check.errors.length) {
      console.warn(`Daily outreach skipped ${b.name}: ${check.errors.join(" ")}`);
      result.skipped++;
      return;
    }
    if (!first) await new Promise((r) => setTimeout(r, GAP_MS));
    first = false;
    try {
      const sent = await sendEmail({
        to: b.email!,
        subject,
        html: plainEmailToHtml(body),
        text: body,
        headers: { "List-Unsubscribe": `<mailto:${SENDER.email}?subject=stop>` },
      });
      await supabase.from("sent_emails").insert({
        business_id: b.id,
        recipient_email: b.email,
        subject,
        body,
        status: "sent",
        kind: "first",
        resend_id: sent?.id || null,
      });
      result[bucket]++;
    } catch (err) {
      console.error(`Daily outreach failed for ${b.name}:`, err);
      result.skipped++;
    }
  };

  for (const b of kbo) await send(b, "kbo");
  for (const b of google) await send(b, "google");

  await supabase
    .from("settings")
    .update({ value: { ...config, last_run_date: day, last_result: result } })
    .eq("key", "daily_outreach");

  return NextResponse.json({ success: true, ...result });
}
