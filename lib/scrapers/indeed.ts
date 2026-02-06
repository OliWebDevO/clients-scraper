import { ScraperResult, randomDelay } from "./base";
import type { Job } from "@/lib/types";
import puppeteer from "puppeteer";

export class IndeedScraper {
  private source = "Indeed";
  private baseUrl = "https://be.indeed.com";

  async scrape(keywords: string[], location?: string): Promise<ScraperResult> {
    const jobs: Partial<Job>[] = [];
    let browser;

    try {
      browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-blink-features=AutomationControlled",
        ],
      });

      const page = await browser.newPage();

      // Stealth: override navigator.webdriver
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => false });
      });

      await page.setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );
      await page.setViewport({ width: 1280, height: 800 });

      for (const keyword of keywords) {
        try {
          const searchUrl = this.buildSearchUrl(keyword, location);
          await randomDelay(2000, 4000);

          await page.goto(searchUrl, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
          });

          // Wait for job results to load
          try {
            await page.waitForSelector(
              ".job_seen_beacon, .jobsearch-ResultsList, .tapItem, .result",
              { timeout: 10000 }
            );
          } catch {
            // Page may have loaded but with different selectors or captcha
            console.log(`Indeed: no job cards found for "${keyword}", may be blocked`);
            continue;
          }

          // Extract jobs from the page
          const pageJobs = await page.evaluate((baseUrl: string) => {
            const results: {
              title: string;
              company: string | null;
              location: string | null;
              salary: string | null;
              url: string;
            }[] = [];

            const cards = document.querySelectorAll(
              ".job_seen_beacon, .tapItem, .resultContent"
            );

            cards.forEach((card) => {
              const titleEl =
                card.querySelector("h2.jobTitle a") ||
                card.querySelector("h2.jobTitle span[title]") ||
                card.querySelector("a[data-jk]") ||
                card.querySelector(".jobTitle a");
              if (!titleEl) return;

              const title = titleEl.textContent?.trim();
              if (!title) return;

              // URL
              let url = "";
              const linkEl = titleEl.closest("a") || titleEl.querySelector("a");
              const jk =
                linkEl?.getAttribute("data-jk") ||
                card.closest("[data-jk]")?.getAttribute("data-jk");
              if (jk) {
                url = `${baseUrl}/viewjob?jk=${jk}`;
              } else if (linkEl?.getAttribute("href")) {
                const href = linkEl.getAttribute("href")!;
                url = href.startsWith("http") ? href : `${baseUrl}${href}`;
              }
              if (!url) return;

              const company =
                card.querySelector("[data-testid='company-name']")?.textContent?.trim() ||
                card.querySelector(".companyName")?.textContent?.trim() ||
                card.querySelector(".company")?.textContent?.trim() ||
                null;

              const location =
                card.querySelector("[data-testid='text-location']")?.textContent?.trim() ||
                card.querySelector(".companyLocation")?.textContent?.trim() ||
                null;

              const salary =
                card.querySelector("[data-testid='attribute_snippet_testid']")?.textContent?.trim() ||
                card.querySelector(".salary-snippet-container")?.textContent?.trim() ||
                card.querySelector(".salaryText")?.textContent?.trim() ||
                null;

              results.push({ title, company, location, salary, url });
            });

            return results;
          }, this.baseUrl);

          for (const pj of pageJobs) {
            if (jobs.some((j) => j.url === pj.url)) continue;

            const matchedKeywords = this.matchesKeyword(pj.title, keywords);
            if (matchedKeywords.length === 0) {
              matchedKeywords.push(keyword);
            }

            jobs.push({
              title: pj.title,
              company: pj.company,
              location: pj.location || location,
              salary: pj.salary,
              url: pj.url,
              source: this.source,
              keywords_matched: matchedKeywords,
            });
          }
        } catch (err) {
          console.error(`Error scraping Indeed for keyword "${keyword}":`, err);
        }
      }

      if (jobs.length === 0) {
        return {
          jobs,
          error: "Indeed: aucun résultat. Le site peut bloquer les requêtes automatisées.",
        };
      }

      return { jobs };
    } catch (error) {
      return {
        jobs,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  private buildSearchUrl(keyword: string, location?: string): string {
    const params = new URLSearchParams();
    params.set("q", keyword);
    if (location) {
      params.set("l", location);
    }
    params.set("sort", "date");
    return `${this.baseUrl}/jobs?${params.toString()}`;
  }

  private matchesKeyword(text: string, keywords: string[]): string[] {
    const lowerText = text.toLowerCase();
    return keywords.filter((kw) => {
      if (lowerText.includes(kw.toLowerCase())) return true;
      const words = kw.toLowerCase().split(/\s+/).filter((w) => w.length >= 4);
      return words.some((word) => lowerText.includes(word));
    });
  }
}
