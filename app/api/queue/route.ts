import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { checkEmail } from "@/lib/email-checks";
import { reviewDraft } from "@/lib/outreach-queue";
import { isRateLimited, getClientIdentifier } from "@/lib/rate-limit";

const FIELDS =
  "id, business_id, recipient_email, subject, body, kind, status, checks, ai_review, error_message, created_at, sent_at, businesses(name, category, address)";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Emails waiting for review / approved, plus the last ones handled */
export async function GET() {
  const supabase = createServerSupabaseClient();
  const [{ data: open }, { data: recent }] = await Promise.all([
    supabase.from("outreach_queue").select(FIELDS).in("status", ["pending", "approved", "failed"]).order("created_at"),
    supabase
      .from("outreach_queue")
      .select(FIELDS)
      .in("status", ["sent", "rejected"])
      .order("updated_at", { ascending: false })
      .limit(30),
  ]);
  return NextResponse.json({ success: true, open: open || [], recent: recent || [] });
}

/**
 * PATCH { id, subject?, body?, status? } — edit and/or change status ("approved" | "rejected" | "pending").
 * Edits re-run the rule checks; approving an email with blocking errors is refused.
 */
export async function PATCH(request: NextRequest) {
  const { id, subject, body, status } = await request.json();
  if (typeof id !== "string" || !UUID.test(id)) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }
  if (status !== undefined && !["approved", "rejected", "pending"].includes(status)) {
    return NextResponse.json({ success: false, error: "Invalid status" }, { status: 400 });
  }
  if ((subject !== undefined && (typeof subject !== "string" || subject.length > 300)) || (body !== undefined && (typeof body !== "string" || body.length > 20000))) {
    return NextResponse.json({ success: false, error: "Invalid subject or body" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data: row } = await supabase
    .from("outreach_queue")
    .select("subject, body, recipient_email, status, businesses(name)")
    .eq("id", id)
    .single();
  if (!row) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (row.status === "sent") return NextResponse.json({ success: false, error: "Déjà envoyé" }, { status: 409 });

  const nextSubject = subject ?? row.subject;
  const nextBody = body ?? row.body;
  const business = (Array.isArray(row.businesses) ? row.businesses[0] : row.businesses) as { name: string } | null;
  const checks = checkEmail({ subject: nextSubject, text: nextBody, recipientEmail: row.recipient_email, businessName: business?.name });
  if (status === "approved" && checks.errors.length) {
    return NextResponse.json({ success: false, error: `À corriger avant validation : ${checks.errors.join(" ")}` }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("outreach_queue")
    .update({
      subject: nextSubject,
      body: nextBody,
      checks,
      ...(status ? { status, error_message: null } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(FIELDS)
    .single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}

/**
 * POST { action: "review", id } — re-run the AI proofreading on the current text
 * POST { action: "approve_clean" } — approve every pending email without blocking error
 */
export async function POST(request: NextRequest) {
  if (isRateLimited("queue-actions", 30, 60 * 1000, getClientIdentifier(request))) {
    return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
  }
  const { action, id } = await request.json();
  const supabase = createServerSupabaseClient();

  if (action === "approve_clean") {
    const { data: pending } = await supabase.from("outreach_queue").select("id, checks").eq("status", "pending");
    const clean = (pending || []).filter((r) => !(r.checks as { errors?: string[] } | null)?.errors?.length).map((r) => r.id);
    if (clean.length) {
      await supabase.from("outreach_queue").update({ status: "approved", updated_at: new Date().toISOString() }).in("id", clean);
    }
    return NextResponse.json({ success: true, approved: clean.length });
  }

  if (action === "review" && typeof id === "string" && UUID.test(id)) {
    const { data: row } = await supabase
      .from("outreach_queue")
      .select("subject, body, recipient_email, businesses(name, category, address)")
      .eq("id", id)
      .single();
    if (!row) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    const business = (Array.isArray(row.businesses) ? row.businesses[0] : row.businesses) as
      | { name: string; category: string | null; address: string | null }
      | null;
    const review = await reviewDraft({
      subject: row.subject,
      body: row.body,
      recipientEmail: row.recipient_email,
      businessName: business?.name,
      category: business?.category,
      location: business?.address,
    });
    const { data } = await supabase
      .from("outreach_queue")
      .update({ ...review, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(FIELDS)
      .single();
    return NextResponse.json({ success: true, data });
  }

  return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
}
