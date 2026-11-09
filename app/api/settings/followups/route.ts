import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { DEFAULT_FOLLOWUP_SETTINGS, type FollowUpSettings } from "@/lib/outreach";

export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase.from("settings").select("value").eq("key", "followups").maybeSingle();
  const value: FollowUpSettings = { ...DEFAULT_FOLLOWUP_SETTINGS, ...(data?.value as Partial<FollowUpSettings> | undefined) };

  return NextResponse.json({ success: true, data: value });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const enabled = body.enabled === true;
  const delay = Math.round(Number(body.delay_days));
  if (!Number.isFinite(delay) || delay < 2 || delay > 21) {
    return NextResponse.json({ success: false, error: "Le délai doit être entre 2 et 21 jours" }, { status: 400 });
  }
  const supabase = createServerSupabaseClient();
  const value: FollowUpSettings = { enabled, delay_days: delay };
  const { error } = await supabase
    .from("settings")
    .upsert({ key: "followups", value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data: value });
}
