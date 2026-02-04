import { BaseScraper, ScraperResult } from "./base";
import type { Job } from "@/lib/types";

export class LinkedInScraper extends BaseScraper {
  constructor() {
    super("LinkedIn", "https://www.linkedin.com");
  }

  async scrape(keywords: string[], location?: string): Promise<ScraperResult> {
    const jobs: Partial<Job>[] = [];

    // LinkedIn has strong anti-bot measures
    // This scraper attempts to use the public job search which doesn't require auth
    // but may be limited or blocked

    try {
      for (const keyword of keywords) {
        const searchUrl = this.buildSearchUrl(keyword, location);

        try {
          const html = await this.fetchPage(searchUrl);
          const $ = this.parseHtml(html);

          // LinkedIn public job listings
          const jobCards = $(".jobs-search__results-list li, .base-card, .job-search-card");

          jobCards.each((_, element) => {
            try {
              const $el = $(element);

              // Title
              const titleEl = $el.find("h3.base-search-card__title, .job-search-card__title, h3 a").first();
              const title = this.extractText(titleEl);

              if (!title) return;

              // URL
              const linkEl = $el.find("a.base-card__full-link, a.job-search-card__link-wrapper").first();
              const href = linkEl.attr("href") || titleEl.attr("href");
              if (!href) return;

              // Clean up LinkedIn tracking params
              let url = this.normalizeUrl(href);
              try {
                const urlObj = new URL(url);
                urlObj.search = ""; // Remove query params
                url = urlObj.toString();
              } catch {
                // Keep original URL if parsing fails
              }

              // Company
              const company = this.extractText($el.find("h4.base-search-card__subtitle, .job-search-card__company-name"));

              // Location
              const jobLocation = this.extractText($el.find(".job-search-card__location, .base-search-card__metadata span")) ||
                                 location;

              // Posted date
              const postedText = this.extractText($el.find("time, .job-search-card__listdate"));

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
                posted_at: postedText ? this.parseLinkedInDate(postedText) : undefined,
              });
            } catch (err) {
              console.error("Error parsing LinkedIn job:", err);
            }
          });
        } catch (err) {
          // LinkedIn often blocks scrapers - log but continue
          console.error(`LinkedIn scraping failed for keyword "${keyword}":`, err);
        }
      }

      // Add a note if no jobs were found (likely blocked)
      if (jobs.length === 0) {
        return {
          jobs,
          error: "LinkedIn scraping may be limited due to anti-bot measures. Consider using LinkedIn's official API for production use.",
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

  private buildSearchUrl(keyword: string, location?: string): string {
    const params = new URLSearchParams();
    params.set("keywords", keyword);
    if (location) {
      params.set("location", location);
    }
    params.set("f_TPR", "r86400"); // Posted in last 24 hours
    params.set("position", "1");
    params.set("pageNum", "0");
    return `${this.baseUrl}/jobs/search?${params.toString()}`;
  }

  private parseLinkedInDate(text: string): string | undefined {
    // LinkedIn uses relative dates like "1 day ago", "2 weeks ago"
    const now = new Date();
    const lowerText = text.toLowerCase();

    if (lowerText.includes("hour") || lowerText.includes("minute") || lowerText.includes("just")) {
      return now.toISOString();
    }

    const dayMatch = lowerText.match(/(\d+)\s*day/);
    if (dayMatch) {
      const days = parseInt(dayMatch[1], 10);
      now.setDate(now.getDate() - days);
      return now.toISOString();
    }

    const weekMatch = lowerText.match(/(\d+)\s*week/);
    if (weekMatch) {
      const weeks = parseInt(weekMatch[1], 10);
      now.setDate(now.getDate() - weeks * 7);
      return now.toISOString();
    }

    const monthMatch = lowerText.match(/(\d+)\s*month/);
    if (monthMatch) {
      const months = parseInt(monthMatch[1], 10);
      now.setMonth(now.getMonth() - months);
      return now.toISOString();
    }

    return undefined;
  }
}
