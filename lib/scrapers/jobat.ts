import { BaseScraper, ScraperResult } from "./base";
import type { Job } from "@/lib/types";

export class JobatScraper extends BaseScraper {
  constructor() {
    super("Jobat", "https://www.jobat.be");
  }

  async scrape(keywords: string[], location?: string, page?: number): Promise<ScraperResult> {
    const jobs: Partial<Job>[] = [];

    try {
      for (const keyword of keywords) {
        const searchUrl = this.buildSearchUrl(keyword, page);

        try {
          const html = await this.fetchPage(searchUrl);
          const $ = this.parseHtml(html);

          // Jobat uses .jobResults-card for each job listing
          $(".jobResults-card").each((_, element) => {
            try {
              const $el = $(element);

              // Title & URL
              const titleEl = $el.find("h2.jobTitle a").first();
              const title = this.extractText(titleEl);
              if (!title) return;

              const href = titleEl.attr("href") || $el.attr("data-id");
              if (!href) return;
              const url = this.normalizeUrl(href);

              // Company
              const company = this.extractText($el.find(".jobCard-company a")) ||
                             this.extractText($el.find(".jobCard-company"));

              // Location
              const jobLocation = this.extractText($el.find(".jobCard-location")) ||
                                 location;

              // Check for duplicates
              if (jobs.some((j) => j.url === url)) return;

              const matchedKeywords = this.matchesKeyword(title, keywords);
              if (matchedKeywords.length === 0) {
                matchedKeywords.push(keyword);
              }

              jobs.push({
                title,
                company,
                location: jobLocation,
                url,
                source: this.source,
                keywords_matched: matchedKeywords,
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

  private buildSearchUrl(keyword: string, page = 1): string {
    // Jobat uses /en/jobs/results/{keyword-slug} URL pattern
    const slug = keyword.replace(/\s+/g, "-").toLowerCase();
    const base = `${this.baseUrl}/en/jobs/results/${slug}`;
    return page > 1 ? `${base}?page=${page}` : base;
  }
}
