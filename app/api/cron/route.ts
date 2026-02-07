import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getScraperForPlatform } from "@/lib/scrapers";
import { scrapeGoogleMapsWithProgress } from "@/lib/scrapers/google-maps-stream";
import type { ScrapeSchedule, JobPlatform } from "@/lib/types";

export const maxDuration = 300;

// Verify cron secret to prevent unauthorized access
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("CRON_SECRET is not configured - rejecting request");
    return false;
  }

  return authHeader === `Bearer ${cronSecret}`;
}

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
          // Run business scraper
          const result = await scrapeGoogleMapsWithProgress({
            location: schedule.config.location || "Belgium",
            radius: schedule.config.radius || 10,
            minRating: schedule.config.min_rating || 0,
            categories: schedule.config.categories,
          }, () => {});

          const bizBuffer: Record<string, unknown>[] = [];
          for (const business of result.businesses) {
            if (!business.name) continue;

            bizBuffer.push({
              name: business.name,
              address: business.address || null,
              phone: business.phone || null,
              rating: business.rating || null,
              review_count: business.review_count || null,
              category: business.category || null,
              google_maps_url: business.google_maps_url || null,
              has_website: business.has_website || false,
              website_url: business.website_url || null,
              website_score: business.website_score || null,
              website_issues: business.website_issues || null,
              location_query: business.location_query,
            });

            if (bizBuffer.length >= 25) {
              const { error: insertError } = await supabase.from("businesses").upsert(bizBuffer, { onConflict: "name,address" });
              if (!insertError) itemsFound += bizBuffer.length;
              bizBuffer.length = 0;
            }
          }

          if (bizBuffer.length > 0) {
            const { error: insertError } = await supabase.from("businesses").upsert(bizBuffer, { onConflict: "name,address" });
            if (!insertError) itemsFound += bizBuffer.length;
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
