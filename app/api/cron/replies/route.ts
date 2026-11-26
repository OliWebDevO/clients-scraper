import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { verifyCronSecret } from "@/lib/cron-auth";
import { syncReplies } from "@/lib/replies";
import { brusselsDate } from "@/lib/daily-outreach";

export const maxDuration = 300;

const READ_HOUR = 7; // once a day, before the 8:00 send: a prospect who replied gets no follow-up

/** Called hourly, reads prospects' replies from the webdev@ inbox at 7:00 (Brussels) */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (brusselsDate().hour !== READ_HOUR) return NextResponse.json({ success: true, message: `Lecture à ${READ_HOUR}h seulement` });
  try {
    const result = await syncReplies(createServerSupabaseClient());
    return NextResponse.json({ success: !result.error, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lecture de la boîte impossible";
    console.error("Replies sync failed:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
