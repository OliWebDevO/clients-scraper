import { BaseScraper, ScraperResult } from "./base";
import type { Job } from "@/lib/types";

export class LinkedInScraper extends BaseScraper {
  constructor() {
    super("LinkedIn", "https://www.linkedin.com");
  }

  async scrape(keywords: string[], location?: string): Promise<ScraperResult> {
    const jobs: Partial<Job>[] = [];

    try {
      for (const keyword of keywords) {
        // Fetch 2 pages (10 results each) for more results
        for (const start of [0, 10]) {
          const searchUrl = this.buildSearchUrl(keyword, location, start);

          try {
            const html = await this.fetchPage(searchUrl);
            const $ = this.parseHtml(html);

            const jobCards = $("li");

            jobCards.each((_, element) => {
              try {
                const $el = $(element);
                const $card = $el.find(".base-search-card, .job-search-card").first();
                if ($card.length === 0) return;

                // Title
                const title = this.extractText($card.find("h3.base-search-card__title"));
                if (!title) return;

                // URL
                const href = $card.find("a.base-card__full-link").attr("href");
                if (!href) return;

                // Clean tracking params
                let url = href.split("?")[0];
                if (!url.startsWith("http")) {
                  url = this.normalizeUrl(url);
                }

                // Company
                const company = this.extractText($card.find("h4.base-search-card__subtitle a"));

                // Location
                const jobLocation = this.extractText($card.find(".job-search-card__location")) || location;

                // Posted date
                const timeEl = $card.find("time");
                const datetime = timeEl.attr("datetime");

                // Check for duplicates
                if (jobs.some((j) => j.url === url)) return;

                const matchedKeywords = this.matchesKeyword(title, keywords);
                if (matchedKeywords.length === 0) {
                  // Still include since LinkedIn search is relevant, tag with searched keyword
                  matchedKeywords.push(keyword);
                }

                jobs.push({
                  title,
                  company,
                  location: jobLocation,
                  url,
                  source: this.source,
                  keywords_matched: matchedKeywords,
                  posted_at: datetime || undefined,
                });
              } catch (err) {
                console.error("Error parsing LinkedIn job:", err);
              }
            });
          } catch (err) {
            console.error(`LinkedIn scraping failed for keyword "${keyword}" (start=${start}):`, err);
          }
        }
      }

      if (jobs.length === 0) {
        return {
          jobs,
          error: "LinkedIn: aucun résultat trouvé. Les mesures anti-bot peuvent limiter l'accès.",
        };
      }

      return { jobs };
    } catch (error) {
      return {
        jobs,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private buildSearchUrl(keyword: string, location?: string, start = 0): string {
    const params = new URLSearchParams();
    params.set("keywords", keyword);
    if (location) {
      params.set("location", location);
    }
    params.set("start", start.toString());
    // Use the guest API that returns server-rendered HTML
    return `${this.baseUrl}/jobs-guest/jobs/api/seeMoreJobPostings/search?${params.toString()}`;
  }
}
