import { BaseScraper, ScraperResult } from "./base";
import type { Job } from "@/lib/types";

export class ActirisScraper extends BaseScraper {
  constructor() {
    super("Actiris", "https://www.actiris.brussels");
  }

  async scrape(keywords: string[], location?: string): Promise<ScraperResult> {
    const jobs: Partial<Job>[] = [];

    try {
      for (const keyword of keywords) {
        const searchUrl = this.buildSearchUrl(keyword);

        try {
          const html = await this.fetchPage(searchUrl);
          const $ = this.parseHtml(html);

          // Actiris job card selectors
          const jobCards = $(".job-result, .offer-item, .job-listing, .views-row");

          jobCards.each((_, element) => {
            try {
              const $el = $(element);

              // Title
              const titleEl = $el.find("h3 a, h2 a, .job-title a, .offer-title a").first();
              const title = this.extractText(titleEl);

              if (!title) return;

              // URL
              const href = titleEl.attr("href");
              if (!href) return;
              const url = this.normalizeUrl(href);

              // Company
              const company = this.extractText($el.find(".employer, .company, .offer-company"));

              // Location - Actiris is Brussels-focused
              const jobLocation = this.extractText($el.find(".location, .offer-location")) ||
                                 "Brussels";

              // Check for duplicates
              if (jobs.some((j) => j.url === url)) return;

              // Match keywords
              const matchedKeywords = this.matchesKeyword(title, keywords);

              jobs.push({
                title,
                company,
                location: jobLocation,
                url,
                source: this.source,
                keywords_matched: matchedKeywords.length > 0 ? matchedKeywords : [keyword],
              });
            } catch (err) {
              console.error("Error parsing Actiris job:", err);
            }
          });
        } catch (err) {
          console.error(`Error fetching Actiris for keyword "${keyword}":`, err);
        }
      }

      return { jobs };
    } catch (error) {
      return {
        jobs,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private buildSearchUrl(keyword: string): string {
    const encodedKeyword = encodeURIComponent(keyword);
    return `${this.baseUrl}/en/citizens/find-a-job/job-offers?search=${encodedKeyword}`;
  }
}
