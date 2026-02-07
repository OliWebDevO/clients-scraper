import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getScraperForPlatform } from "@/lib/scrapers";
import { expandKeywords } from "@/lib/scrapers/base";
import { isRateLimited, getClientIdentifier } from "@/lib/rate-limit";
import type { JobPlatform, Job } from "@/lib/types";

export const maxDuration = 300; // 5 minutes max for Vercel

interface ScrapeJobsRequest {
  platforms: JobPlatform[];
  keywords: string[];
  location?: string;
}

export async function POST(request: NextRequest) {
  const clientIp = getClientIdentifier(request);
  if (isRateLimited("scrape-jobs", 5, 60 * 1000, clientIp)) {
    return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
  }

  try {
    const body: ScrapeJobsRequest = await request.json();
    const { platforms, location } = body;
    const keywords = expandKeywords(body.keywords);

    if (!platforms || platforms.length === 0) {
      return NextResponse.json(
        { success: false, error: "No platforms specified" },
        { status: 400 }
      );
    }

    if (!keywords || keywords.length === 0) {
      return NextResponse.json(
        { success: false, error: "No keywords specified" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Create scrape log
    const { data: log, error: logError } = await supabase
      .from("scrape_logs")
      .insert({
        type: "jobs",
        source: platforms.join(", "),
        status: "running",
        items_found: 0,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (logError) {
      console.error("Error creating scrape log:", logError);
    }

    const allJobs: Partial<Job>[] = [];
    const errors: string[] = [];

    // Scrape each platform
    for (const platform of platforms) {
      try {
        console.log(`Scraping ${platform}...`);
        const scraper = getScraperForPlatform(platform);
        const result = await scraper.scrape(keywords, location);

        if (result.error) {
          errors.push(`${platform}: ${result.error}`);
        }

        allJobs.push(...result.jobs);
        console.log(`Found ${result.jobs.length} jobs from ${platform}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        errors.push(`${platform}: ${errorMsg}`);
        console.error(`Error scraping ${platform}:`, error);
      }
    }

    // Insert jobs into database in batches (upsert to avoid duplicates)
    let insertedCount = 0;
    const buffer: Record<string, unknown>[] = [];

    for (const job of allJobs) {
      if (!job.url || !job.title) continue;

      buffer.push({
        title: job.title,
        company: job.company || null,
        location: job.location || null,
        salary: job.salary || null,
        description: job.description || null,
        url: job.url,
        source: job.source || "unknown",
        keywords_matched: job.keywords_matched || [],
        posted_at: job.posted_at || null,
      });

      if (buffer.length >= 25) {
        const { error } = await supabase.from("jobs").upsert(buffer, { onConflict: "url" });
        if (!error) insertedCount += buffer.length;
        buffer.length = 0;
      }
    }

    if (buffer.length > 0) {
      const { error } = await supabase.from("jobs").upsert(buffer, { onConflict: "url" });
      if (!error) insertedCount += buffer.length;
    }

    // Update scrape log
    if (log) {
      await supabase
        .from("scrape_logs")
        .update({
          status: errors.length > 0 && insertedCount === 0 ? "failed" : "completed",
          items_found: insertedCount,
          error_message: errors.length > 0 ? errors.join("; ") : null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", log.id);
    }

    return NextResponse.json({
      success: true,
      message: `Scraped ${platforms.length} platforms`,
      items_found: insertedCount,
      total_found: allJobs.length,
      log_id: log?.id,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Scrape jobs error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "An internal error occurred",
      },
      { status: 500 }
    );
  }
}
