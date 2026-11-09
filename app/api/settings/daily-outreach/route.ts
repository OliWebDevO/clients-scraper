import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import {
  DEFAULT_DAILY_SETTINGS,
  selectGoogleCandidates,
  selectKboCandidates,
  type DailyOutreachSettings,
} from "@/lib/daily-outreach";

async function load() {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase.from("settings").select("value").eq("key", "daily_outreach").maybeSingle();
  const value: DailyOutreachSettings = { ...DEFAULT_DAILY_SETTINGS, ...(data?.value as Partial<DailyOutreachSettings> | undefined) };
  return { supabase, value };
}

/** Settings + a preview of who the next run would email (no email lookups, nothing sent) */
export async function GET() {
  const { supabase, value } = await load();
  const [kbo, google] = await Promise.all([
    selectKboCandidates(supabase, value.kbo_count),
    selectGoogleCandidates(supabase, value.google_count),
  ]);
  return NextResponse.json({
    success: true,
    data: value,
    preview: {
      kbo: kbo.map((b) => ({ name: b.name, email: b.email })),
      google: google.map((b) => ({ name: b.name, email: b.email, rating: b.rating })),
    },
  });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const hour = Math.round(Number(body.hour));
  const kbo = Math.round(Number(body.kbo_count));
  const google = Math.round(Number(body.google_count));
  if (![hour, kbo, google].every(Number.isFinite) || hour < 6 || hour > 20 || kbo < 0 || kbo > 30 || google < 0 || google > 30) {
    return NextResponse.json({ success: false, error: "Heure entre 6 et 20, au maximum 30 envois par lot" }, { status: 400 });
  }
  const { supabase, value } = await load();
  const next: DailyOutreachSettings = { ...value, enabled: body.enabled === true, hour, kbo_count: kbo, google_count: google };
  const { error } = await supabase
    .from("settings")
    .upsert({ key: "daily_outreach", value: next, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data: next });
}
