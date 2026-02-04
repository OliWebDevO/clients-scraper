import { BaseScraper, ScraperResult } from "./base";
import type { Job } from "@/lib/types";

export class JobatScraper extends BaseScraper {
  constructor() {
    super("Jobat", "https://www.jobat.be");
  }

  async scrape(keywords: string[], location?: string): Promise<ScraperResult> {
    const jobs: Partial<Job>[] = [];

    try {
      for (const keyword of keywords) {
        const searchUrl = this.buildSearchUrl(keyword, location);

        try {
          const html = await this.fetchPage(searchUrl);
          const $ = this.parseHtml(html);

          // Jobat job card selectors
          const jobCards = $(".job-card, .search-result-item, article[data-job-id]");

          jobCards.each((_, element) => {
            try {
              const $el = $(element);

              // Title
              const titleEl = $el.find("h2 a, .job-title a, a.job-link").first();
              const title = this.extractText(titleEl);

              if (!title) return;

              // URL
              const href = titleEl.attr("href");
              if (!href) return;
              const url = this.normalizeUrl(href);

              // Company
              const company = this.extractText($el.find(".company-name, .employer-name, [data-company]"));

              // Location
              const jobLocation = this.extractText($el.find(".location, .job-location, [data-location]")) ||
                                 location;

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
              console.error("Error parsing Jobat job:", err);
            }
          });
        } catch (err) {
          console.error(`Error fetching Jobat for keyword "${keyword}":`, err);
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

  private buildSearchUrl(keyword: string, location?: string): string {
    const params = new URLSearchParams();
    params.set("q", keyword);
    if (location) {
      params.set("location", location);
    }
    return `${this.baseUrl}/en/jobs?${params.toString()}`;
  }
}
