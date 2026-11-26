import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { verifyCronSecret } from "@/lib/cron-auth";
import { syncReplies } from "@/lib/replies";

export const maxDuration = 300;

/** Hourly: read prospects' replies from the webdev@ inbox */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await syncReplies(createServerSupabaseClient());
    return NextResponse.json({ success: !result.error, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lecture de la boîte impossible";
    console.error("Replies sync failed:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
