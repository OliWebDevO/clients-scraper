import puppeteer, { Browser, Page } from "puppeteer";
import type { Business } from "@/lib/types";
import { delay, randomDelay, parseRating, parseReviewCount } from "@/lib/utils";
import { analyzeWebsite } from "@/lib/website-analyzer";

export interface GoogleMapsScraperConfig {
  location: string;
  radius: number;
  minRating: number;
  categories?: string[];
  excludeExisting?: Array<{ name: string; address: string | null }>;
  maxResults?: number;
  onProgress?: (current: number, total: number, businessName: string) => void;
}

export interface GoogleMapsScraperResult {
  businesses: Partial<Business>[];
  totalScraped: number;
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
    const allBusinesses: Partial<Business>[] = [];
    const maxResults = config.maxResults || 10;
    const existingSet = new Set(
      (config.excludeExisting || []).map((b) => `${b.name}|||${b.address || ""}`.toLowerCase())
    );

    try {
      if (!this.browser || !this.page) {
        await this.initialize();
      }

      const page = this.page!;
      const categories = config.categories?.length ? config.categories : ["businesses"];

      for (const category of categories) {
        if (allBusinesses.length >= maxResults) break;

        const searchQuery = `${category} near ${config.location}`;
        const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`;

        console.log(`Searching: ${searchQuery}`);
        await page.goto(mapsUrl, { waitUntil: "networkidle0", timeout: 60000 });
        await delay(3000);

        // Handle cookie consent
        await this.handleCookieConsent(page);
        await delay(2000);

        // Scroll to load more results
        await this.scrollResults(page, 8);

        // Get all result links
        const resultLinks = await page.$$('a[href*="/maps/place/"]');
        console.log(`Found ${resultLinks.length} result links`);

        const totalToProcess = Math.min(resultLinks.length, maxResults * 2);

        // Click on each result to get full details
        for (let i = 0; i < totalToProcess && allBusinesses.length < maxResults; i++) {
          try {
            // Report progress
            if (config.onProgress) {
              config.onProgress(allBusinesses.length, maxResults, `Processing ${i + 1}/${totalToProcess}...`);
            }

            // Re-get the links since DOM might have changed
            const currentLinks = await page.$$('a[href*="/maps/place/"]');
            if (i >= currentLinks.length) break;

            const link = currentLinks[i];
            await link.click();
            await delay(2500);

            // Extract business details from the side panel
            const businessData = await page.evaluate(() => {
              let name = document.querySelector('h1.DUwDvf')?.textContent?.trim();
              if (!name) name = document.querySelector('[data-item-id="title"] h1')?.textContent?.trim();
              if (!name) name = document.querySelector('h1')?.textContent?.trim();
              if (!name) return null;

              const ratingEl = document.querySelector('div.F7nice span[aria-hidden="true"]');
              const rating = ratingEl?.textContent?.trim() || null;

              const reviewEl = document.querySelector('div.F7nice span[aria-label*="review"], div.F7nice span[aria-label*="avis"]');
              let reviewCount = reviewEl?.getAttribute('aria-label')?.match(/\d+/)?.[0] || null;
              if (!reviewCount) {
                const reviewText = document.querySelector('div.F7nice')?.textContent || '';
                const match = reviewText.match(/\((\d+)\)/);
                if (match) reviewCount = match[1];
              }

              const categoryEl = document.querySelector('button[jsaction*="category"]');
              const categoryText = categoryEl?.textContent?.trim() || null;

              const addressEl = document.querySelector('button[data-item-id="address"]');
              const address = addressEl?.getAttribute('aria-label')?.replace(/^Adresse\s*:\s*/i, '').replace(/^Address\s*:\s*/i, '').trim() ||
                             addressEl?.textContent?.trim() || null;

              const phoneEl = document.querySelector('button[data-item-id^="phone"]');
              const phone = phoneEl?.getAttribute('aria-label')?.replace(/[^\d+\s-]/g, '').trim() || null;

              const websiteEl = document.querySelector('a[data-item-id="authority"]') as HTMLAnchorElement;
              const websiteUrl = websiteEl?.href || null;

              const mapsUrl = window.location.href;

              return { name, rating, reviewCount, category: categoryText, address, phone, websiteUrl, mapsUrl };
            });

            if (!businessData?.name) continue;

            // Check if already exists
            const key = `${businessData.name}|||${businessData.address || ""}`.toLowerCase();
            if (existingSet.has(key)) continue;

            // Check for duplicates in current batch
            if (allBusinesses.some(b => b.name === businessData.name && b.address === businessData.address)) continue;

            // Apply rating filter
            const rating = parseRating(businessData.rating);
            if (config.minRating && rating && rating < config.minRating) continue;

            const business: Partial<Business> = {
              name: businessData.name,
              address: businessData.address,
              phone: businessData.phone,
              rating,
              review_count: parseReviewCount(businessData.reviewCount),
              category: businessData.category || category,
              google_maps_url: businessData.mapsUrl,
              has_website: !!businessData.websiteUrl,
              website_url: businessData.websiteUrl,
              website_score: null,
              website_issues: null,
              location_query: config.location,
            };

            // Analyze website if present
            if (business.website_url) {
              if (config.onProgress) {
                config.onProgress(allBusinesses.length, maxResults, `Analyzing ${businessData.name}...`);
              }
              try {
                const analysis = await analyzeWebsite(business.website_url);
                if (analysis) {
                  business.website_score = analysis.score;
                  business.website_issues = analysis.issues;

                  // Skip businesses with GOOD websites (score < 25)
                  if (analysis.score < 25) {
                    console.log(`Skipping ${businessData.name} - good website (score: ${analysis.score})`);
                    continue;
                  }
                }
              } catch (err) {
                console.error(`Error analyzing ${business.website_url}:`, err);
              }
            }

            allBusinesses.push(business);
            console.log(`Added: ${businessData.name} | Website: ${business.has_website ? `Yes (score: ${business.website_score})` : 'No'}`);

            await randomDelay(800, 1500);
          } catch (err) {
            console.error(`Error processing result ${i}:`, err);
            continue;
          }
        }

        await randomDelay(2000, 4000);
      }

      // Sort: no website first, then by score (highest = worst site = best prospect)
      const sorted = sortBusinesses(allBusinesses);
      const finalResults = sorted.slice(0, maxResults);

      return {
        businesses: finalResults,
        totalScraped: allBusinesses.length,
      };
    } catch (error) {
      console.error("Google Maps scraping error:", error);
      return {
        businesses: allBusinesses,
        totalScraped: allBusinesses.length,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private async handleCookieConsent(page: Page): Promise<void> {
    try {
      const consentSelectors = [
        'button[aria-label*="Accept all"]',
        'button[aria-label*="Tout accepter"]',
        'button[aria-label*="Accepter tout"]',
        '[aria-label*="Accept"]',
      ];

      for (const selector of consentSelectors) {
        try {
          const btn = await page.$(selector);
          if (btn) {
            await btn.click();
            console.log("Clicked consent button");
            await delay(1500);
            return;
          }
        } catch {
          continue;
        }
      }
    } catch {
      console.log("No consent dialog");
    }
  }

  private async scrollResults(page: Page, scrollCount: number): Promise<void> {
    try {
      for (let i = 0; i < scrollCount; i++) {
        await page.evaluate(() => {
          const container = document.querySelector('[role="feed"], .m6QErb.DxyBCb');
          if (container) container.scrollTop = container.scrollHeight;
        });
        await delay(1500);
      }
    } catch (error) {
      console.error("Error scrolling:", error);
    }
  }
}

function sortBusinesses(businesses: Partial<Business>[]): Partial<Business>[] {
  return [...businesses].sort((a, b) => {
    if (!a.has_website && b.has_website) return -1;
    if (a.has_website && !b.has_website) return 1;
    if (!a.has_website && !b.has_website) return (a.rating || 0) - (b.rating || 0);
    const aScore = a.website_score ?? -1;
    const bScore = b.website_score ?? -1;
    return bScore - aScore;
  });
}

let scraperInstance: GoogleMapsScraper | null = null;

export async function scrapeGoogleMaps(
  config: GoogleMapsScraperConfig
): Promise<GoogleMapsScraperResult> {
  if (!scraperInstance) {
    scraperInstance = new GoogleMapsScraper();
  }

  try {
    return await scraperInstance.scrape(config);
  } finally {
    if (scraperInstance) {
      await scraperInstance.close();
      scraperInstance = null;
    }
  }
}
