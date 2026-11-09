import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { analyzeWebsite, pickEmail } from "@/lib/website-analyzer";
import { getPlatform } from "@/lib/prospect";
import { isRateLimited, getClientIdentifier } from "@/lib/rate-limit";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Look for the business' contact email on its own website and save it */
export async function POST(request: NextRequest) {
  const clientIp = getClientIdentifier(request);
  if (isRateLimited("find-email", 30, 60 * 1000, clientIp)) {
    return NextResponse.json({ email: null, error: "Too many requests" }, { status: 429 });
  }

  const { businessId } = await request.json();
  if (typeof businessId !== "string" || !UUID_REGEX.test(businessId)) {
    return NextResponse.json({ email: null, error: "Invalid ID" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data: business } = await supabase
    .from("businesses")
    .select("email, website_url")
    .eq("id", businessId)
    .single();

  if (!business) return NextResponse.json({ email: null, error: "Business not found" }, { status: 404 });
  if (business.email) return NextResponse.json({ email: business.email });
  if (!business.website_url || getPlatform(business.website_url)) {
    return NextResponse.json({ email: null, reason: "no_website" });
  }

  const analysis = await analyzeWebsite(business.website_url);
  const email = analysis ? pickEmail(analysis.emails, analysis.url) : null;
  if (email) {
    await supabase.from("businesses").update({ email }).eq("id", businessId);
  }
  return NextResponse.json({ email, reason: email ? undefined : "not_found" });
}
