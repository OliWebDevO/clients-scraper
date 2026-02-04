import puppeteer, { Browser, Page } from "puppeteer";
import type { Business } from "@/lib/types";
import { delay, randomDelay, parseRating, parseReviewCount } from "@/lib/utils";

export interface GoogleMapsScraperConfig {
  location: string;
  radius: number;
  minRating: number;
  categories?: string[];
}

export interface GoogleMapsScraperResult {
  businesses: Partial<Business>[];
  error?: string;
}

export class GoogleMapsScraper {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async initialize(): Promise<void> {
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--window-size=1920,1080",
      ],
    });
    this.page = await this.browser.newPage();

    await this.page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    await this.page.setViewport({ width: 1920, height: 1080 });
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  async scrape(config: GoogleMapsScraperConfig): Promise<GoogleMapsScraperResult> {
    const businesses: Partial<Business>[] = [];

    try {
      if (!this.browser || !this.page) {
        await this.initialize();
      }

      const page = this.page!;
      const categories = config.categories?.length ? config.categories : ["businesses"];

      for (const category of categories) {
        // Build search query
        const searchQuery = `${category} near ${config.location}`;
        const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`;

        console.log(`Searching: ${searchQuery}`);

        await page.goto(mapsUrl, { waitUntil: "networkidle0", timeout: 30000 });

        // Wait for results to load
        await delay(3000);

        // Try to dismiss cookie consent if it appears
        try {
          const acceptButton = await page.$('button[aria-label*="Accept"]');
          if (acceptButton) {
            await acceptButton.click();
            await delay(1000);
          }
        } catch {
          // Continue if no consent dialog
        }

        // Scroll to load more results
        await this.scrollResults(page, 5);

        // Extract business data
        const results = await page.evaluate(() => {
          const items: Array<{
            name: string;
            rating: string | null;
            reviewCount: string | null;
            category: string | null;
            address: string | null;
            phone: string | null;
            website: string | null;
            url: string | null;
          }> = [];

          // Google Maps search results container
          const resultElements = document.querySelectorAll('[role="article"], .Nv2PK');

          resultElements.forEach((el) => {
            try {
              // Name
              const nameEl = el.querySelector(".qBF1Pd, .fontHeadlineSmall");
              const name = nameEl?.textContent?.trim();
              if (!name) return;

              // Rating
              const ratingEl = el.querySelector(".MW4etd, .ZkP5Je");
              const rating = ratingEl?.textContent?.trim() || null;

              // Review count
              const reviewEl = el.querySelector(".UY7F9, .e4rVHe");
              const reviewCount = reviewEl?.textContent?.trim() || null;

              // Category/Type
              const categoryEl = el.querySelector(".W4Efsd .W4Efsd span:first-child, .Ahnjwc");
              const category = categoryEl?.textContent?.trim() || null;

              // Address
              const addressEl = el.querySelector('.W4Efsd span[aria-hidden="true"]');
              const address = addressEl?.textContent?.trim() || null;

              // Check for website presence
              const hasWebsite = !!el.querySelector('a[data-value="Website"], a[aria-label*="Website"]');

              // Link to Google Maps
              const linkEl = el.querySelector("a[href*='/maps/place/']") as HTMLAnchorElement;
              const url = linkEl?.href || null;

              items.push({
                name,
                rating,
                reviewCount,
                category,
                address,
                phone: null, // Need to click for details
                website: hasWebsite ? "yes" : null,
                url,
              });
            } catch (err) {
              console.error("Error parsing result:", err);
            }
          });

          return items;
        });

        // Process results
        for (const result of results) {
          const rating = parseRating(result.rating);
          const reviewCount = parseReviewCount(result.reviewCount);

          // Apply filters
          if (config.minRating && rating && rating < config.minRating) {
            continue;
          }

          // Skip if already has website (we want businesses without websites)
          const hasWebsite = result.website === "yes";

          // Deduplicate
          if (businesses.some((b) => b.name === result.name && b.address === result.address)) {
            continue;
          }

          businesses.push({
            name: result.name,
            address: result.address,
            phone: result.phone,
            rating,
            review_count: reviewCount,
            category: result.category || category,
            google_maps_url: result.url,
            has_website: hasWebsite,
            location_query: config.location,
          });
        }

        // Random delay between category searches
        await randomDelay(3000, 6000);
      }

      return { businesses };
    } catch (error) {
      console.error("Google Maps scraping error:", error);
      return {
        businesses,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private async scrollResults(page: Page, scrollCount: number): Promise<void> {
    try {
      // Find the scrollable results container
      const scrollContainer = await page.$('[role="feed"], .m6QErb.DxyBCb');

      if (!scrollContainer) {
        console.log("No scrollable container found");
        return;
      }

      for (let i = 0; i < scrollCount; i++) {
        await page.evaluate(() => {
          const container = document.querySelector('[role="feed"], .m6QErb.DxyBCb');
          if (container) {
            container.scrollTop = container.scrollHeight;
          }
        });

        // Wait for new results to load
        await delay(2000);
      }
    } catch (error) {
      console.error("Error scrolling results:", error);
    }
  }
}

// Singleton instance for reuse
let scraperInstance: GoogleMapsScraper | null = null;

export async function scrapeGoogleMaps(
  config: GoogleMapsScraperConfig
): Promise<GoogleMapsScraperResult> {
  if (!scraperInstance) {
    scraperInstance = new GoogleMapsScraper();
  }

  try {
    const result = await scraperInstance.scrape(config);
    return result;
  } finally {
    // Clean up after scraping
    if (scraperInstance) {
      await scraperInstance.close();
      scraperInstance = null;
    }
  }
}
