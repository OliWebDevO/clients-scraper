import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getScraperForPlatform } from "@/lib/scrapers";
import { scrapeGoogleMapsWithProgress, businessToRow } from "@/lib/scrapers/google-maps-stream";
import type { ScrapeSchedule, JobPlatform } from "@/lib/types";
import { verifyCronSecret } from "@/lib/cron-auth";
import { googleRotationSearch, isContactableGoogleRow, kboEmail } from "@/lib/daily-outreach";
import type { SupabaseClient } from "@supabase/supabase-js";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  // Verify authorization
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServerSupabaseClient();
    const now = new Date().toISOString();

    // Find schedules that are due
    const { data: dueSchedules, error } = await supabase
      .from("scrape_schedules")
      .select("id, name, type, enabled, frequency, time_of_day, day_of_week, config, last_run_at, next_run_at, created_at")
      .eq("enabled", true)
      .lte("next_run_at", now);

    if (error) {
      throw error;
    }

    if (!dueSchedules || dueSchedules.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No schedules due",
        schedules_run: 0,
      });
    }

    const results: Array<{ schedule: string; status: string; items: number }> = [];

    // NOTE: Schedules are processed sequentially. Running them in parallel
    // (e.g. via Promise.allSettled) could improve throughput when multiple
    // schedules are due, but Puppeteer-based scrapers are memory-intensive,
    // so parallel execution risks OOM. With maxDuration=300s, sequential
    // processing is acceptable for the expected workload.
    for (const schedule of dueSchedules as ScrapeSchedule[]) {
      try {
        console.log(`Running schedule: ${schedule.name}`);

        // Create scrape log
        const { data: log } = await supabase
          .from("scrape_logs")
          .insert({
            type: schedule.type,
            source: schedule.type === "jobs" ? schedule.config.platforms?.join(", ") : "Google Maps",
            status: "running",
            items_found: 0,
            started_at: new Date().toISOString(),
          })
          .select()
          .single();

        let itemsFound = 0;

        if (schedule.type === "jobs") {
          // Run job scrapers
          const platforms = (schedule.config.platforms || []) as JobPlatform[];
          const keywords = (schedule.config.keywords || []) as string[];

          for (const platform of platforms) {
            try {
              const scraper = getScraperForPlatform(platform);
              const result = await scraper.scrape(keywords, schedule.config.job_location);

              const buffer: Record<string, unknown>[] = [];
              for (const job of result.jobs) {
                if (!job.url || !job.title) continue;

                buffer.push({
                  title: job.title,
                  company: job.company || null,
                  location: job.location || null,
                  salary: job.salary || null,
                  url: job.url,
                  source: job.source || platform,
                  keywords_matched: job.keywords_matched || [],
                  posted_at: job.posted_at || null,
                });

                if (buffer.length >= 25) {
                  const { error: insertError } = await supabase.from("jobs").upsert(buffer, { onConflict: "url" });
                  if (!insertError) itemsFound += buffer.length;
                  buffer.length = 0;
                }
              }

              if (buffer.length > 0) {
                const { error: insertError } = await supabase.from("jobs").upsert(buffer, { onConflict: "url" });
                if (!insertError) itemsFound += buffer.length;
              }
            } catch (err) {
              console.error(`Error scraping ${platform}:`, err);
            }
          }
        } else if (schedule.type === "businesses") {
          if (schedule.config.rotate) {
            // Claim today's run first: the searches can outlast the next hourly call
            await supabase.from("scrape_schedules").update({ next_run_at: calculateNextRun(schedule) }).eq("id", schedule.id);
            itemsFound = await runGoogleRotation(supabase, schedule);
          } else {
            const result = await scrapeGoogleMapsWithProgress({
              location: schedule.config.location || "Belgium",
              radius: schedule.config.radius || 10,
              minRating: schedule.config.min_rating || 0,
              categories: schedule.config.categories,
            }, () => {});
            itemsFound = await saveBusinesses(supabase, result.businesses.filter((b) => b.name).map((b) => businessToRow(b)));
          }
        }

        // Update scrape log
        if (log) {
          await supabase
            .from("scrape_logs")
            .update({
              status: "completed",
              items_found: itemsFound,
              completed_at: new Date().toISOString(),
            })
            .eq("id", log.id);
        }

        // Calculate next run time
        const nextRun = calculateNextRun(schedule);

        // Update schedule
        await supabase
          .from("scrape_schedules")
          .update({
            last_run_at: new Date().toISOString(),
            next_run_at: nextRun,
          })
          .eq("id", schedule.id);

        results.push({
          schedule: schedule.name,
          status: "completed",
          items: itemsFound,
        });
      } catch (err) {
        console.error(`Error running schedule ${schedule.name}:`, err);
        results.push({
          schedule: schedule.name,
          status: "failed",
          items: 0,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Ran ${results.length} schedules`,
      schedules_run: results.length,
      results,
    });
  } catch (error) {
    console.error("Cron error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "An internal error occurred",
      },
      { status: 500 }
    );
  }
}

function calculateNextRun(schedule: ScrapeSchedule): string {
  const now = new Date();
  const [hours, minutes] = schedule.time_of_day.split(":").map(Number);
  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);

  if (schedule.frequency === "daily") {
    next.setDate(next.getDate() + 1);
  } else if (schedule.frequency === "every_3_days") {
    next.setDate(next.getDate() + 3);
  } else if (schedule.frequency === "weekly") {
    const daysUntilNext = (7 + (schedule.day_of_week ?? 1) - now.getDay()) % 7 || 7;
    next.setDate(next.getDate() + daysUntilNext);
  }

  return next.toISOString();
}

async function saveBusinesses(supabase: SupabaseClient, rows: Record<string, unknown>[]): Promise<number> {
  let saved = 0;
  for (let i = 0; i < rows.length; i += 25) {
    const batch = rows.slice(i, i + 25);
    const { error } = await supabase.from("businesses").upsert(batch, { onConflict: "name,address" });
    if (!error) saved += batch.length;
  }
  return saved;
}

const GOOGLE_CONTACTABLE_PER_DAY = 3; // businesses with an email the daily send can use
const GOOGLE_MAX_SEARCHES = 15;
const GOOGLE_MAX_MINUTES = 40;

/**
 * Trade × municipality searches, one after the other, until the day's searches found
 * GOOGLE_CONTACTABLE_PER_DAY new businesses with a usable email (or the search/time budget runs out).
 * Businesses already in the database are skipped, so their data (emails found later) is never overwritten.
 */
async function runGoogleRotation(supabase: SupabaseClient, schedule: ScrapeSchedule): Promise<number> {
  const { data: known } = await supabase.from("businesses").select("name, address").eq("source", "google_maps").limit(20000);
  const existing = (known || []) as Array<{ name: string; address: string | null }>;
  const deadline = Date.now() + GOOGLE_MAX_MINUTES * 60000;
  let index = schedule.config.rotation_index ?? 0;
  let saved = 0;
  let contactable = 0;
  for (let searches = 0; searches < GOOGLE_MAX_SEARCHES && contactable < GOOGLE_CONTACTABLE_PER_DAY && Date.now() < deadline; searches++) {
    const { category, location } = googleRotationSearch(index++);
    try {
      const result = await scrapeGoogleMapsWithProgress(
        { location, radius: 10, minRating: 0, categories: [category], maxResults: 20, excludeExisting: existing },
        () => {}
      );
      const rows = result.businesses.filter((b) => b.name).map((b) => businessToRow(b, `${category} · ${location}`));
      // No email found on a website (or no website): the KBO may have the company's
      for (const row of rows) {
        if (!row.email) row.email = await kboEmail(supabase, row.name as string, (row.address as string | null) ?? null);
      }
      saved += await saveBusinesses(supabase, rows);
      for (const row of rows) {
        existing.push({ name: row.name as string, address: (row.address as string | null) ?? null });
        if (await isContactableGoogleRow(row as Parameters<typeof isContactableGoogleRow>[0])) contactable++;
      }
      console.log(`Google rotation: ${category} · ${location} → ${rows.length} new, ${contactable}/${GOOGLE_CONTACTABLE_PER_DAY} contactable`);
    } catch (err) {
      console.error(`Google rotation failed on ${category} · ${location}:`, err);
    }
    await supabase.from("scrape_schedules").update({ config: { ...schedule.config, rotation_index: index } }).eq("id", schedule.id);
  }
  return saved;
}
