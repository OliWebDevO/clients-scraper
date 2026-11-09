import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { scrapeGoogleMapsWithProgress, businessToRow } from "@/lib/scrapers/google-maps-stream";
import { isRateLimited, getClientIdentifier } from "@/lib/rate-limit";

export const maxDuration = 300; // 5 minutes max

export async function POST(request: NextRequest) {
  const clientIp = getClientIdentifier(request);
  if (isRateLimited("scrape-businesses", 5, 60 * 1000, clientIp)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 });
  }

  const body = await request.json();
  const { location, minRating, categories } = body;
  const maxResults = Math.min(Math.max(1, Number(body.maxResults) || 10), 100);
  const radius = Math.min(Math.max(1, Number(body.radius) || 10), 50000);

  if (!location) {
    return new Response(
      JSON.stringify({ error: "Location is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Input length validation
  if (Array.isArray(categories) && categories.length > 20) {
    return new Response(
      JSON.stringify({ error: "Maximum 20 categories allowed" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  if (typeof location === "string" && location.length > 200) {
    return new Response(
      JSON.stringify({ error: "Location must be at most 200 characters" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const supabase = createServerSupabaseClient();

  // Get existing businesses to exclude duplicates
  const { data: existingBusinesses } = await supabase
    .from("businesses")
    .select("name, address")
    .eq("location_query", location)
    .limit(5000);

  const excludeExisting = (existingBusinesses || []).map((b) => ({
    name: b.name,
    address: b.address,
  }));

  // Create a readable stream for SSE
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: object) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Create scrape log
        const { data: log } = await supabase
          .from("scrape_logs")
          .insert({
            type: "businesses",
            source: "Google Maps",
            status: "running",
            items_found: 0,
            started_at: new Date().toISOString(),
          })
          .select()
          .single();

        sendEvent("status", { message: "Initialisation du scraper...", progress: 0 });

        // Run the scraper with progress callback
        const result = await scrapeGoogleMapsWithProgress(
          {
            location,
            radius: radius || 10,
            minRating: minRating || 0,
            categories,
            excludeExisting,
            maxResults,
          },
          (progress) => {
            sendEvent("progress", progress);
          }
        );

        if (result.error) {
          sendEvent("error", { message: result.error });

          if (log) {
            await supabase
              .from("scrape_logs")
              .update({
                status: "failed",
                error_message: result.error,
                completed_at: new Date().toISOString(),
              })
              .eq("id", log.id);
          }

          controller.close();
          return;
        }

        // Insert businesses into database in batches
        sendEvent("status", { message: "Sauvegarde des résultats...", progress: 95 });

        let insertedCount = 0;
        let saveError: string | null = null;
        const buffer: Record<string, unknown>[] = [];

        for (const business of result.businesses) {
          if (!business.name) continue;

          buffer.push(businessToRow(business, location));

          if (buffer.length >= 25) {
            const { error } = await supabase.from("businesses").upsert(buffer, { onConflict: "name,address" });
            if (!error) insertedCount += buffer.length;
            else saveError ??= error.message;
            buffer.length = 0;
          }
        }

        if (buffer.length > 0) {
          const { error } = await supabase.from("businesses").upsert(buffer, { onConflict: "name,address" });
          if (!error) insertedCount += buffer.length;
          else saveError ??= error.message;
        }

        // Saving failed (e.g. migration not run): say so instead of reporting "0 found"
        if (saveError) {
          console.error("Business save error:", saveError);
          if (log) {
            await supabase
              .from("scrape_logs")
              .update({ status: "failed", error_message: saveError, completed_at: new Date().toISOString() })
              .eq("id", log.id);
          }
          sendEvent("error", {
            message: `${result.businesses.length} trouvés mais non enregistrés : ${saveError}. As-tu lancé doc/migration-prospecting.sql ?`,
          });
          return;
        }

        // Update scrape log
        if (log) {
          await supabase
            .from("scrape_logs")
            .update({
              status: "completed",
              items_found: insertedCount,
              completed_at: new Date().toISOString(),
            })
            .eq("id", log.id);
        }

        sendEvent("complete", {
          success: true,
          message: `${insertedCount} clients potentiels trouvés à ${location}`,
          items_found: insertedCount,
          total_scraped: result.totalScraped,
        });

      } catch (error) {
        console.error("Scrape stream error:", error);
        sendEvent("error", {
          message: "An unexpected error occurred during scraping"
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
