import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getScraperForPlatform } from "@/lib/scrapers";
import { expandKeywords } from "@/lib/scrapers/base";
import { isRateLimited } from "@/lib/rate-limit";
import type { JobPlatform, Job } from "@/lib/types";

export const maxDuration = 300; // 5 minutes max

interface ScrapeJobsRequest {
  platforms: JobPlatform[];
  keywords: string[];
  location?: string;
  maxResults?: number;
}

export async function POST(request: NextRequest) {
  if (isRateLimited("scrape-jobs", 5, 60 * 1000)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 });
  }

  const body: ScrapeJobsRequest = await request.json();
  const { platforms, location } = body;
  const MAX_JOBS = body.maxResults || 20;
  // Expand keywords with French/English counterparts and contractions
  const keywords = expandKeywords(body.keywords);
  console.log(`Keywords expanded: ${body.keywords.length} -> ${keywords.length}`, keywords);

  if (!platforms || platforms.length === 0) {
    return new Response(
      JSON.stringify({ error: "No platforms specified" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!keywords || keywords.length === 0) {
    return new Response(
      JSON.stringify({ error: "No keywords specified" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const supabase = createServerSupabaseClient();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: object) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Get existing job URLs to avoid duplicates
        const { data: existingJobs } = await supabase
          .from("jobs")
          .select("url");

        const existingUrls = new Set((existingJobs || []).map(j => j.url));
        console.log(`Found ${existingUrls.size} existing jobs to exclude`);

        // Create scrape log
        const { data: log } = await supabase
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

        sendEvent("progress", {
          current: 0,
          total: platforms.length,
          progress: 0,
          message: "Initialisation...",
          phase: "init",
        });

        const allJobs: Partial<Job>[] = [];
        const errors: string[] = [];

        // Scrape each platform
        for (let i = 0; i < platforms.length; i++) {
          const platform = platforms[i];
          const progressPercent = Math.round((i / platforms.length) * 80);

          sendEvent("progress", {
            current: i,
            total: platforms.length,
            progress: progressPercent,
            message: `Scraping ${platform}...`,
            phase: "scraping",
            platform,
          });

          try {
            console.log(`Scraping ${platform}...`);
            const scraper = getScraperForPlatform(platform);
            const result = await scraper.scrape(keywords, location);

            if (result.error) {
              errors.push(`${platform}: ${result.error}`);
              sendEvent("progress", {
                current: i + 1,
                total: platforms.length,
                progress: progressPercent + 5,
                message: `Erreur sur ${platform}: ${result.error}`,
                phase: "error",
                platform,
              });
            } else {
              // Filter out existing jobs
              const newJobs = result.jobs.filter(job => job.url && !existingUrls.has(job.url));

              // Only add up to MAX_JOBS total
              const remainingSlots = MAX_JOBS - allJobs.length;
              const jobsToAdd = newJobs.slice(0, remainingSlots);
              allJobs.push(...jobsToAdd);

              // Add new URLs to existing set to avoid duplicates within same scrape
              jobsToAdd.forEach(job => {
                if (job.url) existingUrls.add(job.url);
              });

              sendEvent("progress", {
                current: i + 1,
                total: platforms.length,
                progress: Math.round(((i + 1) / platforms.length) * 80),
                message: `${platform}: ${newJobs.length} nouvelles offres (${result.jobs.length - newJobs.length} doublons exclus)`,
                phase: "scraping",
                platform,
                jobsFound: jobsToAdd.length,
              });
            }

            console.log(`Found ${result.jobs.length} jobs from ${platform}`);

            // Stop if we've reached MAX_JOBS
            if (allJobs.length >= MAX_JOBS) {
              sendEvent("progress", {
                current: platforms.length,
                total: platforms.length,
                progress: 80,
                message: `Limite de ${MAX_JOBS} offres atteinte`,
                phase: "scraping",
              });
              break;
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Unknown error";
            errors.push(`${platform}: ${errorMsg}`);
            console.error(`Error scraping ${platform}:`, error);

            sendEvent("progress", {
              current: i + 1,
              total: platforms.length,
              progress: Math.round(((i + 1) / platforms.length) * 80),
              message: `Erreur sur ${platform}`,
              phase: "error",
              platform,
            });
          }
        }

        // If we don't have enough jobs, paginate through additional pages
        let currentPage = 1;
        const MAX_PAGES = 3;

        while (allJobs.length < MAX_JOBS && currentPage < MAX_PAGES) {
          currentPage++;

          let foundNewInThisPass = false;

          for (let i = 0; i < platforms.length; i++) {
            if (allJobs.length >= MAX_JOBS) break;

            const platform = platforms[i];

            sendEvent("progress", {
              current: allJobs.length,
              total: MAX_JOBS,
              progress: Math.round((allJobs.length / MAX_JOBS) * 80),
              message: `${allJobs.length}/${MAX_JOBS} - Recherche page ${currentPage} sur ${platform}...`,
              phase: "scraping",
              platform,
            });

            try {
              const scraper = getScraperForPlatform(platform);
              const result = await scraper.scrape(keywords, location, currentPage);

              if (result.error || result.jobs.length === 0) continue;

              const newJobs = result.jobs.filter(job =>
                job.url && !existingUrls.has(job.url) && job.title
              );

              if (newJobs.length > 0) foundNewInThisPass = true;

              const remainingSlots = MAX_JOBS - allJobs.length;
              const jobsToAdd = newJobs.slice(0, remainingSlots);
              allJobs.push(...jobsToAdd);

              jobsToAdd.forEach(job => {
                if (job.url) existingUrls.add(job.url);
              });
            } catch (error) {
              console.error(`Error scraping ${platform} page ${currentPage}:`, error);
            }
          }

          if (!foundNewInThisPass) break;
        }

        // Insert jobs into database
        sendEvent("progress", {
          current: platforms.length,
          total: platforms.length,
          progress: 85,
          message: `Sauvegarde de ${allJobs.length} offres...`,
          phase: "saving",
        });

        let insertedCount = 0;
        for (const job of allJobs) {
          if (!job.url || !job.title) continue;

          const { error } = await supabase.from("jobs").upsert(
            {
              title: job.title,
              company: job.company || null,
              location: job.location || null,
              salary: job.salary || null,
              description: job.description || null,
              url: job.url,
              source: job.source || "unknown",
              keywords_matched: job.keywords_matched || [],
              posted_at: job.posted_at || null,
            },
            { onConflict: "url" }
          );

          if (!error) {
            insertedCount++;
          }
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

        sendEvent("complete", {
          success: true,
          message: `${insertedCount} offres d'emploi sauvegardées`,
          items_found: insertedCount,
          total_found: allJobs.length,
          errors: errors.length > 0 ? errors : undefined,
        });

      } catch (error) {
        console.error("Scrape jobs stream error:", error);
        sendEvent("error", {
          message: error instanceof Error ? error.message : "Erreur inconnue"
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
