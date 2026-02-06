import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { scrapeGoogleMaps } from "@/lib/scrapers/google-maps";

export const maxDuration = 300; // 5 minutes max

interface ScrapeBusinessesRequest {
  location: string;
  radius: number;
  minRating: number;
  categories?: string[];
  maxResults?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: ScrapeBusinessesRequest = await request.json();
    const { location, radius, minRating, categories, maxResults = 10 } = body;

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
      .eq("location_query", location);

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
    const result = await scrapeGoogleMaps({
      location,
      radius: radius || 10,
      minRating: minRating || 0,
      categories,
      excludeExisting,
      maxResults,
    });

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

    // Insert businesses into database
    let insertedCount = 0;
    for (const business of result.businesses) {
      if (!business.name) continue;

      const { error } = await supabase.from("businesses").upsert(
        {
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
        },
        { onConflict: "name,address" }
      );

      if (!error) {
        insertedCount++;
      } else {
        console.error("Insert error:", error);
      }
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
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
