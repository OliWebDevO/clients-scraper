import { BaseScraper, ScraperResult } from "./base";
import type { Job } from "@/lib/types";

export class JobsoraScraper extends BaseScraper {
  constructor() {
    super("Jobsora", "https://be.jobsora.com");
  }

  async scrape(keywords: string[], location?: string): Promise<ScraperResult> {
    const jobs: Partial<Job>[] = [];

    try {
      for (const keyword of keywords) {
        const searchUrl = this.buildSearchUrl(keyword);

        try {
          const html = await this.fetchPage(searchUrl);
          const $ = this.parseHtml(html);

          // Jobsora uses article.c-job-item for each job listing
          $("article.c-job-item").each((_, element) => {
            try {
              const $el = $(element);

              // Title
              const titleEl = $el.find("h2.c-job-item__title a").first();
              const title = this.extractText(titleEl);
              if (!title) return;

              // URL
              const href = titleEl.attr("href") || $el.attr("data-href");
              if (!href) return;
              const url = href.startsWith("http") ? href : this.normalizeUrl(href);

              // Company & Location from info items
              const infoItems = $el.find(".c-job-item__info-item");
              const company = infoItems.length > 0 ? this.extractText(infoItems.eq(0)) : null;
              const jobLocation = (infoItems.length > 1 ? this.extractText(infoItems.eq(1)) : null) ||
                                 location || "Belgium";

              // Check for duplicates
              if (jobs.some((j) => j.url === url)) return;

              const matchedKeywords = this.matchesKeyword(title, keywords);
              if (matchedKeywords.length === 0) {
                // Jobsora search is relevant, tag with searched keyword
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
              console.error("Error parsing Jobsora job:", err);
            }
          });
        } catch (err) {
          console.error(`Error fetching Jobsora for keyword "${keyword}":`, err);
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
    // Jobsora uses /emplois-{keyword} URL pattern
    const encodedKeyword = keyword.replace(/\s+/g, "-").toLowerCase();
    return `${this.baseUrl}/emplois-${encodedKeyword}`;
  }
}
