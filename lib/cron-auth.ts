import type { NextRequest } from "next/server";

/** Cron endpoints are called by the server's crontab with `Authorization: Bearer $CRON_SECRET` */
export function verifyCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("CRON_SECRET is not configured - rejecting request");
    return false;
  }
  return request.headers.get("authorization") === `Bearer ${cronSecret}`;
}
