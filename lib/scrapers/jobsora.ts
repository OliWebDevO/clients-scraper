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
        const searchUrl = this.buildSearchUrl(keyword, location);

        try {
          const html = await this.fetchPage(searchUrl);
          const $ = this.parseHtml(html);

          // Jobsora job card selectors
          const jobCards = $(".job-card, .vacancy-item, .search-result, article.job");

          jobCards.each((_, element) => {
            try {
              const $el = $(element);

              // Title
              const titleEl = $el.find("h2 a, h3 a, .job-title a, .vacancy-title a").first();
              const title = this.extractText(titleEl);

              if (!title) return;

              // URL
              const href = titleEl.attr("href");
              if (!href) return;
              const url = this.normalizeUrl(href);

              // Company
              const company = this.extractText($el.find(".company, .employer, .job-company"));

              // Location
              const jobLocation = this.extractText($el.find(".location, .job-location, .city")) ||
                                 location || "Belgium";

              // Salary
              const salary = this.extractText($el.find(".salary, .job-salary"));

              // Check for duplicates
              if (jobs.some((j) => j.url === url)) return;

              // Match keywords
              const matchedKeywords = this.matchesKeyword(title, keywords);

              jobs.push({
                title,
                company,
                location: jobLocation,
                salary,
                url,
                source: this.source,
                keywords_matched: matchedKeywords.length > 0 ? matchedKeywords : [keyword],
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

  private buildSearchUrl(keyword: string, location?: string): string {
    const encodedKeyword = encodeURIComponent(keyword.replace(/ /g, "-"));
    const loc = location ? encodeURIComponent(location.replace(/ /g, "-")) : "belgium";
    return `${this.baseUrl}/jobs-${encodedKeyword}-in-${loc}.html`;
  }
}
