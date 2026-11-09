/**
 * Review queue (server only): automatic emails are prepared here, checked (rules + AI),
 * approved or edited by Oliver on the "À valider" page, then sent by the hourly cron.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkEmail, type EmailCheckResult } from "./email-checks";
import { reviewOutreachEmail, type EmailReview } from "./ai-customize";
import { sendEmail } from "./resend";
import { plainEmailToHtml } from "./outreach";
import { SENDER } from "./prospect";

export type QueueStatus = "pending" | "approved" | "sent" | "rejected" | "failed";

export interface QueueRow {
  id: string;
  business_id: string | null;
  recipient_email: string;
  subject: string;
  body: string;
  kind: "first" | "followup";
  status: QueueStatus;
  checks: EmailCheckResult | null;
  ai_review: EmailReview | null;
  error_message: string | null;
  created_at: string;
  sent_at: string | null;
}

/** Rule checks + AI proofreading. The AI is optional: if it fails, the rules still apply. */
export async function reviewDraft(input: {
  subject: string;
  body: string;
  recipientEmail: string;
  businessName?: string;
  category?: string | null;
  location?: string | null;
}): Promise<{ checks: EmailCheckResult; ai_review: EmailReview | null }> {
  const checks = checkEmail({
    subject: input.subject,
    text: input.body,
    recipientEmail: input.recipientEmail,
    businessName: input.businessName,
  });
  let ai_review: EmailReview | null = null;
  try {
    ai_review = await reviewOutreachEmail({
      subject: input.subject,
      text: input.body,
      category: input.category ?? null,
      location: input.location ?? null,
    });
  } catch (err) {
    console.warn("AI review unavailable:", err);
  }
  return { checks, ai_review };
}

export async function queueEmail(
  supabase: SupabaseClient,
  draft: {
    businessId: string;
    recipientEmail: string;
    subject: string;
    body: string;
    kind: "first" | "followup";
    businessName?: string;
    category?: string | null;
    location?: string | null;
  }
): Promise<void> {
  const review = await reviewDraft({
    subject: draft.subject,
    body: draft.body,
    recipientEmail: draft.recipientEmail,
    businessName: draft.businessName,
    category: draft.category,
    location: draft.location,
  });
  const { error } = await supabase.from("outreach_queue").insert({
    business_id: draft.businessId,
    recipient_email: draft.recipientEmail,
    subject: draft.subject,
    body: draft.body,
    kind: draft.kind,
    status: "pending",
    ...review,
  });
  if (error) throw new Error(`Queue insert failed: ${error.message}`);
}

/** Businesses already waiting in the queue must not be prepared a second time */
export async function queuedBusinessIds(supabase: SupabaseClient, kind?: "first" | "followup"): Promise<Set<string>> {
  let query = supabase.from("outreach_queue").select("business_id").in("status", ["pending", "approved"]).limit(10000);
  if (kind) query = query.eq("kind", kind);
  const { data } = await query;
  return new Set((data || []).map((r) => r.business_id as string));
}

/** Send one approved email, re-checking opt-outs at send time */
export async function sendQueued(supabase: SupabaseClient, row: QueueRow): Promise<"sent" | "rejected" | "failed"> {
  const recipient = row.recipient_email.toLowerCase();
  const [{ data: optOut }, { data: business }] = await Promise.all([
    supabase.from("email_optouts").select("email").eq("email", recipient).maybeSingle(),
    row.business_id
      ? supabase.from("businesses").select("name, do_not_contact, replied").eq("id", row.business_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (optOut || business?.do_not_contact || (row.kind === "followup" && business?.replied)) {
    await supabase
      .from("outreach_queue")
      .update({ status: "rejected", error_message: "Désinscrit, « ne plus contacter » ou a répondu entre-temps", updated_at: new Date().toISOString() })
      .eq("id", row.id);
    return "rejected";
  }

  const check = checkEmail({ subject: row.subject, text: row.body, recipientEmail: recipient, businessName: business?.name });
  if (check.errors.length) {
    await supabase
      .from("outreach_queue")
      .update({ status: "pending", checks: check, error_message: `Bloqué : ${check.errors.join(" ")}`, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    return "failed";
  }

  try {
    const sent = await sendEmail({
      to: recipient,
      subject: row.subject,
      html: plainEmailToHtml(row.body),
      text: row.body,
      headers: { "List-Unsubscribe": `<mailto:${SENDER.email}?subject=stop>` },
    });
    const now = new Date().toISOString();
    await supabase.from("sent_emails").insert({
      business_id: row.business_id,
      recipient_email: recipient,
      subject: row.subject,
      body: row.body,
      status: "sent",
      kind: row.kind,
      resend_id: sent?.id || null,
    });
    await supabase
      .from("outreach_queue")
      .update({ status: "sent", sent_at: now, resend_id: sent?.id || null, error_message: null, updated_at: now })
      .eq("id", row.id);
    return "sent";
  } catch (err) {
    await supabase
      .from("outreach_queue")
      .update({ status: "failed", error_message: err instanceof Error ? err.message : "Envoi impossible", updated_at: new Date().toISOString() })
      .eq("id", row.id);
    return "failed";
  }
}
