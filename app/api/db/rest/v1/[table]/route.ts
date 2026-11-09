import { NextRequest, NextResponse } from "next/server";

// Read-only proxy for the browser Supabase client (lib/supabase.ts).
// The middleware session check protects it, so the database grants nothing to the public anon key.
const READABLE_TABLES = new Set([
  "businesses",
  "jobs",
  "sent_emails",
  "scrape_logs",
  "business_drafts",
  "job_drafts",
  "email_templates",
]);
const REQUEST_HEADERS = ["accept", "prefer", "range", "range-unit"];
const RESPONSE_HEADERS = ["content-type", "content-range"];

export async function GET(request: NextRequest, { params }: { params: Promise<{ table: string }> }) {
  const { table } = await params;
  if (!READABLE_TABLES.has(table)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" }, { status: 500 });
  }

  const headers = new Headers({ apikey: serviceKey, Authorization: `Bearer ${serviceKey}` });
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const upstream = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${table}${request.nextUrl.search}`,
    { method: request.method, headers }
  );

  const responseHeaders = new Headers();
  for (const name of RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

// supabase-js uses HEAD for `{ count: "exact", head: true }`
export const HEAD = GET;
