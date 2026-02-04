import { BaseScraper, ScraperResult } from "./base";
import type { Job } from "@/lib/types";

export class ICTJobScraper extends BaseScraper {
  constructor() {
    super("ICTJob", "https://www.ictjob.be");
  }

  async scrape(keywords: string[], location?: string): Promise<ScraperResult> {
    const jobs: Partial<Job>[] = [];

    try {
      for (const keyword of keywords) {
        const searchUrl = this.buildSearchUrl(keyword, location);
        const html = await this.fetchPage(searchUrl);
        const $ = this.parseHtml(html);

        $(".job-listing, .search-item, li.clearfix").each((_, element) => {
          try {
            const $el = $(element);
            const titleEl = $el.find("h2 a, .job-title a, a.job-title").first();
            const title = this.extractText(titleEl);
            if (!title) return;

            const href = titleEl.attr("href");
            if (!href) return;
            const url = this.normalizeUrl(href);

            const company = this.extractText($el.find(".job-company, .company"));
            const jobLocation = this.extractText($el.find(".job-location, .location")) || location;

            if (jobs.some((j) => j.url === url)) return;

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
            console.error("Error parsing job listing:", err);
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

  private buildSearchUrl(keyword: string, location?: string): string {
    const params = new URLSearchParams();
    params.set("q", keyword);
    if (location) params.set("location", location);
    return `${this.baseUrl}/en/search-it-jobs?${params.toString()}`;
  }
}
