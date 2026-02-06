import * as cheerio from "cheerio";
import type { Job } from "@/lib/types";

export interface ScraperResult {
  jobs: Partial<Job>[];
  error?: string;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomDelay(min: number, max: number): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return delay(ms);
}

export abstract class BaseScraper {
  protected source: string;
  protected baseUrl: string;

  constructor(source: string, baseUrl: string) {
    this.source = source;
    this.baseUrl = baseUrl;
  }

  abstract scrape(keywords: string[], location?: string): Promise<ScraperResult>;

  protected async fetchPage(url: string): Promise<string> {
    await randomDelay(2000, 5000);

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        Connection: "keep-alive",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.text();
  }

  protected parseHtml(html: string) {
    return cheerio.load(html);
  }

  protected normalizeUrl(url: string): string {
    if (url.startsWith("http")) {
      return url;
    }
    if (url.startsWith("//")) {
      return `https:${url}`;
    }
    if (url.startsWith("/")) {
      return `${this.baseUrl}${url}`;
    }
    return `${this.baseUrl}/${url}`;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected extractText(element: cheerio.Cheerio<any> | undefined): string | null {
    if (!element) return null;
    const text = element.text().trim();
    return text || null;
  }

  protected matchesKeyword(text: string, keywords: string[]): string[] {
    const lowerText = text.toLowerCase();
    return keywords.filter((kw) => lowerText.includes(kw.toLowerCase()));
  }
}
