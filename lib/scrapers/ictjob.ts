import { BaseScraper, ScraperResult } from "./base";
import type { Job } from "@/lib/types";

export class ICTJobScraper extends BaseScraper {
  constructor() {
    super("ICTJob", "https://www.ictjob.be");
  }

  async scrape(keywords: string[], location?: string, page?: number): Promise<ScraperResult> {
    const jobs: Partial<Job>[] = [];

    try {
      for (const keyword of keywords) {
        const searchUrl = this.buildSearchUrl(keyword, location, page);
        const html = await this.fetchPage(searchUrl);
        const $ = this.parseHtml(html);

        // ICTJob uses .search-item.clearfix for each job listing
        $(".search-item.clearfix").each((_, element) => {
          try {
            const $el = $(element);

            // Skip non-job items (like "create job alert")
            if ($el.hasClass("create-job-alert-search-item")) return;

            // Title & URL via the link with class .search-item-link
            const titleEl = $el.find("a.search-item-link").first();
            const title = this.extractText(titleEl.find("h2.job-title")) ||
                         this.extractText(titleEl);
            if (!title) return;

            const href = titleEl.attr("href");
            if (!href) return;
            const url = this.normalizeUrl(href);

            // Company
            const company = this.extractText($el.find("span.job-company"));

            // Location - nested in schema.org markup
            const jobLocation = this.extractText($el.find("span.job-location span[itemprop='addressLocality']")) ||
                               this.extractText($el.find("span.job-location")) ||
                               location;

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
            console.error("Error parsing ICTJob listing:", err);
          }
        });
      }

      return { jobs };
    } catch (error) {
      return {
        jobs,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private buildSearchUrl(keyword: string, location?: string, page = 1): string {
    const params = new URLSearchParams();
    params.set("q", keyword);
    if (location) params.set("location", location);
    if (page > 1) params.set("page", page.toString());
    return `${this.baseUrl}/en/search-it-jobs?${params.toString()}`;
  }
}
