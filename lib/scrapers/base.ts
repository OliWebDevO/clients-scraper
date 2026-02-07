import * as cheerio from "cheerio";
import type { Job } from "@/lib/types";

// Keyword synonym groups: each group contains EN, FR, and contractions
const KEYWORD_GROUPS = [
  ["web developer", "développeur web", "web dev"],
  ["front-end developer", "développeur front-end", "front-end dev", "frontend developer", "développeur frontend", "frontend dev"],
  ["back-end developer", "développeur back-end", "back-end dev", "backend developer", "développeur backend", "backend dev"],
  ["full-stack developer", "développeur full-stack", "full-stack dev", "fullstack developer", "développeur fullstack", "fullstack dev"],
  ["wordpress developer", "développeur wordpress", "wordpress dev"],
  ["react developer", "développeur react", "react dev"],
  ["junior developer", "développeur junior", "junior dev"],
  ["senior developer", "développeur senior", "senior dev"],
  ["software developer", "développeur logiciel", "software dev"],
  ["software engineer", "ingénieur logiciel", "ingénieur software"],
  ["mobile developer", "développeur mobile", "mobile dev"],
  ["php developer", "développeur php", "php dev"],
  ["java developer", "développeur java", "java dev"],
  ["python developer", "développeur python", "python dev"],
  ["javascript developer", "développeur javascript", "javascript dev", "js developer", "développeur js", "js dev"],
  ["typescript developer", "développeur typescript", "typescript dev", "ts developer", "développeur ts", "ts dev"],
  ["angular developer", "développeur angular", "angular dev"],
  ["vue developer", "développeur vue", "vue dev", "vue.js developer", "développeur vue.js", "vuejs dev"],
  ["node developer", "développeur node", "node dev", "node.js developer", "développeur node.js", "nodejs dev"],
  ["devops engineer", "ingénieur devops", "devops"],
  ["data engineer", "ingénieur data", "ingénieur données"],
  ["data analyst", "analyste données", "analyste data"],
  ["ui designer", "designer ui", "ui/ux designer", "designer ui/ux"],
  ["ux designer", "designer ux"],
  ["web designer", "designer web", "webdesigner"],
  ["project manager", "chef de projet", "gestionnaire de projet"],
  ["product manager", "chef de produit"],
  ["scrum master", "scrum master"],
  ["qa engineer", "ingénieur qa", "testeur logiciel", "quality assurance"],
  ["system administrator", "administrateur système", "sysadmin"],
  ["network engineer", "ingénieur réseau"],
  ["cloud engineer", "ingénieur cloud"],
  ["security engineer", "ingénieur sécurité", "cybersecurity engineer", "ingénieur cybersécurité"],
];

/**
 * Expand keywords with their French/English counterparts and contractions.
 * Returns deduplicated list of all keyword variants.
 */
export function expandKeywords(keywords: string[]): string[] {
  const expanded = new Set<string>();

  for (const keyword of keywords) {
    expanded.add(keyword);
    const lowerKw = keyword.toLowerCase();

    for (const group of KEYWORD_GROUPS) {
      if (group.some(variant => variant.toLowerCase() === lowerKw)) {
        for (const variant of group) {
          expanded.add(variant);
        }
        break;
      }
    }
  }

  return Array.from(expanded);
}

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

  abstract scrape(keywords: string[], location?: string, page?: number): Promise<ScraperResult>;

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
    return keywords.filter((kw) => {
      // Exact phrase match
      if (lowerText.includes(kw.toLowerCase())) return true;
      // Word-level match: if any significant word (4+ chars) from the keyword appears in the title
      const words = kw.toLowerCase().split(/\s+/).filter((w) => w.length >= 4);
      return words.some((word) => lowerText.includes(word));
    });
  }
}
