import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { scrapeGoogleMaps } from "@/lib/scrapers/google-maps";

export const maxDuration = 300; // 5 minutes max

interface ScrapeBusinessesRequest {
  location: string;
  radius: number;
  minRating: number;
  categories?: string[];
}

export async function POST(request: NextRequest) {
  try {
    const body: ScrapeBusinessesRequest = await request.json();
    const { location, radius, minRating, categories } = body;

    if (!location) {
      return NextResponse.json(
        { success: false, error: "Location is required" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

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
    console.log(`Scraping businesses in ${location}...`);
    const result = await scrapeGoogleMaps({
      location,
      radius: radius || 10,
      minRating: minRating || 0,
      categories,
    });

    if (result.error) {
      // Update log with error
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
          location_query: business.location_query || location,
        },
        { onConflict: "name,address" }
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
          status: "completed",
          items_found: insertedCount,
          completed_at: new Date().toISOString(),
        })
        .eq("id", log.id);
    }

    return NextResponse.json({
      success: true,
      message: `Scraped businesses in ${location}`,
      items_found: insertedCount,
      total_found: result.businesses.length,
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
