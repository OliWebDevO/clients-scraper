import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/resend";
import { escapeHtml } from "@/lib/outreach";
import { isRateLimited, getClientIdentifier } from "@/lib/rate-limit";

const FIELDS =
  "id, message_id, business_id, from_email, from_name, subject, body, received_at, auto_reply, status, answered_at, businesses(name, category, address, website_url)";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Replies from prospects, newest first, plus the state of the hourly inbox check */
export async function GET() {
  const supabase = createServerSupabaseClient();
  const [{ data, error }, { data: sync }] = await Promise.all([
    supabase.from("prospect_replies").select(FIELDS).order("received_at", { ascending: false }).limit(200),
    supabase.from("settings").select("value").eq("key", "replies_sync").maybeSingle(),
  ]);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data: data || [], sync: sync?.value ?? null });
}

/**
 * POST { id, action }
 * - "answer" + body: reply in the same thread (In-Reply-To), logged in sent_emails
 * - "refusal": never contact again (opt-out list + do_not_contact), marked handled
 * - "handled" | "new": file / unfile the reply
 */
export async function POST(request: NextRequest) {
  if (isRateLimited(getClientIdentifier(request), 30, 60_000)) {
    return NextResponse.json({ success: false, error: "Trop de requêtes" }, { status: 429 });
  }
  const { id, action, body } = await request.json();
  if (typeof id !== "string" || !UUID.test(id) || !["answer", "refusal", "handled", "new"].includes(action)) {
    return NextResponse.json({ success: false, error: "Requête invalide" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data: reply } = await supabase.from("prospect_replies").select(FIELDS).eq("id", id).single();
  if (!reply) return NextResponse.json({ success: false, error: "Réponse introuvable" }, { status: 404 });

  if (action === "handled" || action === "new") {
    await supabase.from("prospect_replies").update({ status: action }).eq("id", id);
    return NextResponse.json({ success: true });
  }

  if (action === "refusal") {
    await supabase
      .from("email_optouts")
      .upsert({ email: reply.from_email, reason: `Réponse négative (${new Date().toISOString().slice(0, 10)})` }, { onConflict: "email" });
    if (reply.business_id) {
      await supabase.from("businesses").update({ replied: true, do_not_contact: true }).eq("id", reply.business_id);
    }
    await supabase.from("prospect_replies").update({ status: "handled" }).eq("id", id);
    return NextResponse.json({ success: true });
  }

  // answer
  if (typeof body !== "string" || body.trim().length < 2 || body.length > 20000) {
    return NextResponse.json({ success: false, error: "Message vide ou trop long" }, { status: 400 });
  }
  // The opt-out list prevails over everything, a reply included
  const { data: optOut } = await supabase.from("email_optouts").select("reason").eq("email", reply.from_email).maybeSingle();
  if (optOut) {
    return NextResponse.json(
      { success: false, error: "Cette adresse est dans la liste de non-envoi : réponds depuis ta messagerie si nécessaire." },
      { status: 409 }
    );
  }
  const subject = /^(re|tr|fwd?)\s*:/i.test(reply.subject ?? "") ? reply.subject! : `Re: ${reply.subject ?? ""}`.trim();
  try {
    const sent = await sendEmail({
      to: reply.from_email,
      subject,
      // A conversation, not a campaign: no opt-out footer
      html: `<div style="font-family: Arial, sans-serif; line-height: 1.6;">${escapeHtml(body.trim()).replace(/\n/g, "<br>")}</div>`,
      text: body.trim(),
      headers: { "In-Reply-To": reply.message_id, References: reply.message_id },
    });
    const now = new Date().toISOString();
    await supabase.from("sent_emails").insert({
      business_id: reply.business_id,
      recipient_email: reply.from_email,
      subject,
      body: body.trim(),
      status: "sent",
      kind: "reply",
      resend_id: sent?.id || null,
    });
    await supabase.from("prospect_replies").update({ status: "handled", answered_at: now }).eq("id", id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Envoi impossible" }, { status: 500 });
  }
}
