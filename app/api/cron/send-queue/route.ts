import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { verifyCronSecret } from "@/lib/cron-auth";
import { brusselsDate } from "@/lib/daily-outreach";
import { sendQueued, type QueueRow } from "@/lib/outreach-queue";

export const maxDuration = 900;

const MAX_PER_RUN = 30;
const GAP_MS = 20_000; // spread sends: bursts hurt deliverability

/** Hourly: send the emails approved on the "À valider" page (8:00–20:00 Brussels) */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { hour } = brusselsDate();
  if (hour < 8 || hour >= 20) return NextResponse.json({ success: true, message: "Outside sending hours", sent: 0 });

  const supabase = createServerSupabaseClient();
  const { data: rows } = await supabase
    .from("outreach_queue")
    .select("id, business_id, recipient_email, subject, body, kind, status, checks, ai_review, error_message, created_at, sent_at")
    .eq("status", "approved")
    .order("created_at")
    .limit(MAX_PER_RUN);

  const result = { sent: 0, rejected: 0, failed: 0 };
  for (const [i, row] of ((rows || []) as QueueRow[]).entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, GAP_MS));
    result[await sendQueued(supabase, row)]++;
  }
  return NextResponse.json({ success: true, ...result });
}
