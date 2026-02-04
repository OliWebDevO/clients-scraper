import { BaseScraper, ScraperResult } from "./base";
import type { Job } from "@/lib/types";

export class IndeedScraper extends BaseScraper {
  constructor() {
    super("Indeed", "https://be.indeed.com");
  }

  async scrape(keywords: string[], location?: string): Promise<ScraperResult> {
    const jobs: Partial<Job>[] = [];

    try {
      for (const keyword of keywords) {
        const searchUrl = this.buildSearchUrl(keyword, location);

        try {
          const html = await this.fetchPage(searchUrl);
          const $ = this.parseHtml(html);

          // Indeed uses different selectors - try multiple
          const jobCards = $(".job_seen_beacon, .jobsearch-ResultsList > li, .tapItem");

          jobCards.each((_, element) => {
            try {
              const $el = $(element);

              // Title
              const titleEl = $el.find("h2.jobTitle a, .jobTitle > a, a[data-jk]").first();
              const title = this.extractText(titleEl) ||
                           this.extractText($el.find("h2.jobTitle span[title]"));

              if (!title) return;

              // URL - Indeed uses data-jk attribute for job IDs
              let url: string;
              const jobKey = titleEl.attr("data-jk") || $el.attr("data-jk");
              const href = titleEl.attr("href");

              if (jobKey) {
                url = `${this.baseUrl}/viewjob?jk=${jobKey}`;
              } else if (href) {
                url = this.normalizeUrl(href);
              } else {
                return;
              }

              // Company
              const company = this.extractText($el.find(".companyName, [data-testid='company-name']"));

              // Location
              const jobLocation = this.extractText($el.find(".companyLocation, [data-testid='text-location']")) ||
                                 location;

              // Salary
              const salary = this.extractText($el.find(".salary-snippet-container, [data-testid='attribute_snippet_testid']"));

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
              console.error("Error parsing Indeed job:", err);
            }
          });
        } catch (err) {
          console.error(`Error fetching Indeed for keyword "${keyword}":`, err);
          // Continue with next keyword
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
      params.set("l", location);
    }
    params.set("sort", "date"); // Sort by date to get newest
    return `${this.baseUrl}/jobs?${params.toString()}`;
  }
}
