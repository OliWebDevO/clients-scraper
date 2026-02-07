import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { scrapeGoogleMapsWithProgress } from "@/lib/scrapers/google-maps-stream";
import { isRateLimited, getClientIdentifier } from "@/lib/rate-limit";

export const maxDuration = 300; // 5 minutes max

interface ScrapeBusinessesRequest {
  location: string;
  radius: number;
  minRating: number;
  categories?: string[];
  maxResults?: number;
}

export async function POST(request: NextRequest) {
  const clientIp = getClientIdentifier(request);
  if (isRateLimited("scrape-businesses", 5, 60 * 1000, clientIp)) {
    return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
  }

  try {
    const body: ScrapeBusinessesRequest = await request.json();
    const { location, radius, minRating, categories } = body;
    const maxResults = Math.min(Math.max(1, Number(body.maxResults) || 10), 100);

    if (!location) {
      return NextResponse.json(
        { success: false, error: "Location is required" },
        { status: 400 }
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

    console.log(`Found ${excludeExisting.length} existing businesses to exclude`);

    // Create scrape log
    const { data: log, error: logError } = await supabase
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

    if (logError) {
      console.error("Error creating scrape log:", logError);
    }

    // Run the scraper
    console.log(`Scraping NEW businesses in ${location}...`);
    const result = await scrapeGoogleMapsWithProgress({
      location,
      radius: radius || 10,
      minRating: minRating || 0,
      categories,
      excludeExisting,
      maxResults,
    }, () => {});

    if (result.error) {
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

      return NextResponse.json(
        { success: false, error: result.error, items_found: result.businesses.length },
        { status: 500 }
      );
    }

    // Insert businesses into database in batches
    let insertedCount = 0;
    const buffer: Record<string, unknown>[] = [];

    for (const business of result.businesses) {
      if (!business.name) continue;

      buffer.push({
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
        location_query: business.location_query || location,
      });

      if (buffer.length >= 25) {
        const { error } = await supabase.from("businesses").upsert(buffer, { onConflict: "name,address" });
        if (!error) insertedCount += buffer.length;
        else console.error("Insert error:", error);
        buffer.length = 0;
      }
    }

    if (buffer.length > 0) {
      const { error } = await supabase.from("businesses").upsert(buffer, { onConflict: "name,address" });
      if (!error) insertedCount += buffer.length;
      else console.error("Insert error:", error);
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

    return NextResponse.json({
      success: true,
      message: `Found ${insertedCount} potential clients in ${location}`,
      items_found: insertedCount,
      total_scraped: result.totalScraped,
      excluded_existing: excludeExisting.length,
      log_id: log?.id,
    });
  } catch (error) {
    console.error("Scrape businesses error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "An internal error occurred",
      },
      { status: 500 }
    );
  }
}
