/**
 * Review queue (server only): automatic emails are prepared here, checked (rules + AI),
 * approved or edited by Oliver on the "À valider" page, then sent by the hourly cron.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkEmail, OPT_OUT_TEXT, type EmailCheckResult } from "./email-checks";
import { reviewOutreachEmail, correctOutreachEmail, type EmailReview } from "./ai-customize";
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

/* ── Automatic AI correction, then direct send ── */

const SIGNATURE_START = "\n\nBien cordialement";

/** The AI only sees the message itself: signature (and quoted first email) are never touched */
function splitBody(body: string): { content: string; tail: string } {
  const i = body.indexOf(SIGNATURE_START);
  return i === -1 ? { content: body, tail: "" } : { content: body.slice(0, i), tail: body.slice(i) };
}

const numbers = (s: string) => (s.match(/\d+(?:[.,]\d+)?/g) || []).sort().join("|");
const domains = (s: string) =>
  (s.toLowerCase().match(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:be|com|fr|eu|net|org|nl|lu|info|brussels|shop|io|co)\b/g) || []).sort().join("|");
const paragraphs = (s: string) => s.trim().split(/\n\s*\n/).length;

/** Reject a correction that changed facts, dropped the name or rewrote too much */
export function correctionIsSafe(
  original: { subject: string; content: string },
  corrected: { subject: string; content: string },
  businessName?: string
): string | null {
  if (numbers(original.content) !== numbers(corrected.content) || numbers(original.subject) !== numbers(corrected.subject)) {
    return "l'IA a modifié un chiffre";
  }
  if (domains(original.content + original.subject) !== domains(corrected.content + corrected.subject)) {
    return "l'IA a modifié un nom de domaine";
  }
  if (businessName) {
    const name = businessName.toLowerCase();
    for (const part of ["subject", "content"] as const) {
      if (original[part].toLowerCase().includes(name) && !corrected[part].toLowerCase().includes(name)) {
        return "l'IA a retiré le nom de l'entreprise";
      }
    }
  }
  if (businessName) {
    const escaped = businessName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const withArticle = new RegExp(`\\b(?:la|le|les|du|des)\\s+${escaped}|\\bl['’]${escaped}`, "gi");
    const count = (s: string) => (s.match(withArticle) || []).length;
    if (count(corrected.content + corrected.subject) > count(original.content + original.subject)) {
      return "l'IA a ajouté un article devant le nom de l'entreprise";
    }
  }
  if (paragraphs(original.content) !== paragraphs(corrected.content)) return "l'IA a changé la structure des paragraphes";
  const frenchSpacing = (s: string) => (s.match(/ [:?!]/g) || []).length;
  if (frenchSpacing(corrected.content + corrected.subject) < frenchSpacing(original.content + original.subject)) {
    return "l'IA a retiré une espace avant : ? ou !";
  }
  const ratio = corrected.content.length / Math.max(1, original.content.length);
  if (ratio < 0.8 || ratio > 1.25) return "l'IA a trop réécrit le texte";
  if (!corrected.subject || corrected.subject.length > 90) return "sujet corrigé invalide";
  return null;
}

/**
 * Direct mode: the AI corrects the phrasing, the result is checked, then sent.
 * Anything doubtful (AI unavailable, blocking remark, unsafe correction, failed checks)
 * goes to the "À valider" page instead of being sent.
 */
export async function autoCorrectAndSend(
  supabase: SupabaseClient,
  draft: {
    businessId: string;
    recipientEmail: string;
    subject: string;
    body: string;
    kind: "first" | "followup";
    businessName?: string;
    displayName?: string; // name as written in the email (cleaned), for the safety check
    category?: string | null;
    location?: string | null;
    lockSubject?: boolean; // follow-ups keep "Re: …" so they land in the same thread
  }
): Promise<"sent" | "queued"> {
  const { content, tail } = splitBody(draft.body);
  let reason: string | null = null;
  let subject = draft.subject;
  let body = draft.body;
  let changes: string[] = [];
  let verdict = "Aucune correction nécessaire";

  try {
    const fix = await correctOutreachEmail({ subject: draft.subject, body: content, category: draft.category ?? null, location: draft.location ?? null });
    if (fix.blocking) {
      reason = fix.blocking; // a real problem: a human must look at it
    } else {
      const unsafe = correctionIsSafe({ subject: draft.subject, content }, { subject: fix.subject, content: fix.body }, draft.displayName);
      if (unsafe) {
        // The template text already passed every check: send it rather than a risky rewrite
        verdict = `Correction IA refusée (${unsafe}) : texte d'origine envoyé`;
      } else {
        subject = draft.lockSubject ? draft.subject : fix.subject;
        body = fix.body + tail;
        changes = fix.changes;
        if (changes.length) verdict = "Corrigé automatiquement";
      }
    }
  } catch (err) {
    console.warn("AI correction unavailable:", err);
    reason = "correction IA indisponible";
  }

  const checks = checkEmail({ subject, text: body, recipientEmail: draft.recipientEmail, businessName: draft.businessName });
  if (!reason && checks.errors.length) reason = `vérifications : ${checks.errors.join(" ")}`;

  const base = {
    business_id: draft.businessId,
    recipient_email: draft.recipientEmail,
    subject,
    body,
    kind: draft.kind,
    checks,
  };

  if (reason) {
    // Not sent: waits for a human on the "À valider" page, with the reason
    const { error } = await supabase.from("outreach_queue").insert({
      ...base,
      subject: draft.subject,
      body: draft.body,
      status: "pending",
      error_message: `Non envoyé automatiquement : ${reason}`,
    });
    if (error) throw new Error(`Queue insert failed: ${error.message}`);
    return "queued";
  }

  const { data: row, error } = await supabase
    .from("outreach_queue")
    .insert({
      ...base,
      status: "approved",
      ai_review: {
        verdict,
        problems: changes,
        suggestions: [],
      },
    })
    .select("id, business_id, recipient_email, subject, body, kind, status, checks, ai_review, error_message, created_at, sent_at")
    .single();
  if (error || !row) throw new Error(`Queue insert failed: ${error?.message}`);
  const outcome = await sendQueued(supabase, row as QueueRow);
  return outcome === "sent" ? "sent" : "queued";
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
      text: `${row.body}\n\n—\n${OPT_OUT_TEXT}`, // same opt-out line as the HTML version
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
