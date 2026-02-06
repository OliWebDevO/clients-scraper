import * as cheerio from "cheerio";
import { randomDelay } from "@/lib/scrapers/base";

const PLATFORM_SELECTORS: Record<string, string[]> = {
  linkedin: [".description__text", ".show-more-less-html__markup", ".jobs-description__content"],
  indeed: ["#jobDescriptionText", ".jobsearch-jobDescriptionText", '[data-testid="jobDescriptionText"]'],
  ictjob: [".job-description", ".job-info", ".vacancy-description"],
  jobat: [".job-description", ".vacancy-description", ".job-detail__description"],
  actiris: [".field--name-field-description", ".job-description", ".offer-description"],
  jobsora: [".job-description", ".vacancy-description", ".description"],
};

const GENERIC_SELECTORS = [
  '[class*="description"]',
  '[class*="job-detail"]',
  '[class*="vacancy"]',
  "article",
  "main",
  '[role="main"]',
];

function detectPlatform(url: string): string | null {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes("linkedin.com")) return "linkedin";
  if (lowerUrl.includes("indeed.com") || lowerUrl.includes("indeed.be")) return "indeed";
  if (lowerUrl.includes("ictjob.be")) return "ictjob";
  if (lowerUrl.includes("jobat.be")) return "jobat";
  if (lowerUrl.includes("actiris.brussels")) return "actiris";
  if (lowerUrl.includes("jobsora.com")) return "jobsora";
  return null;
}

async function scrapeWithPuppeteer(url: string): Promise<string> {
  const puppeteer = await import("puppeteer");
  const browser = await puppeteer.default.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    await page.waitForSelector("#jobDescriptionText, .jobsearch-jobDescriptionText", { timeout: 10000 }).catch(() => {});
    const html = await page.content();
    return html;
  } finally {
    await browser.close();
  }
}

async function scrapeWithFetch(url: string): Promise<string> {
  await randomDelay(1000, 3000);
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5,fr;q=0.3",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }
  return response.text();
}

async function scrapeActirisApi(url: string): Promise<string> {
  // Actiris uses JSON API - extract offer ID from URL
  const match = url.match(/\/(\d+)/);
  if (match) {
    try {
      const apiUrl = `https://www.actiris.brussels/api/offers/${match[1]}`;
      const response = await fetch(apiUrl, {
        headers: { Accept: "application/json" },
      });
      if (response.ok) {
        const data = await response.json();
        if (data.description) return data.description;
      }
    } catch {
      // fallback to HTML scraping
    }
  }
  const html = await scrapeWithFetch(url);
  return extractFromHtml(html, "actiris");
}

function extractFromHtml(html: string, platform: string | null): string {
  const $ = cheerio.load(html);

  // Remove scripts, styles, nav, footer
  $("script, style, nav, footer, header, .navbar, .footer").remove();

  // Try platform-specific selectors
  if (platform && PLATFORM_SELECTORS[platform]) {
    for (const selector of PLATFORM_SELECTORS[platform]) {
      const el = $(selector);
      if (el.length > 0) {
        const text = el.first().text().trim();
        if (text.length > 50) return cleanText(text);
      }
    }
  }

  // Try generic selectors
  for (const selector of GENERIC_SELECTORS) {
    const el = $(selector);
    if (el.length > 0) {
      const text = el.first().text().trim();
      if (text.length > 50) return cleanText(text);
    }
  }

  // Last resort: body text
  const bodyText = $("body").text().trim();
  return cleanText(bodyText).slice(0, 5000);
}

function cleanText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function scrapeJobDescription(url: string): Promise<string> {
  const platform = detectPlatform(url);

  // Special handling for platforms that need JS rendering
  if (platform === "indeed") {
    try {
      const html = await scrapeWithPuppeteer(url);
      const description = extractFromHtml(html, platform);
      if (description.length > 50) return description;
    } catch (e) {
      console.warn("Puppeteer failed for Indeed, falling back to fetch:", e);
    }
  }

  // Actiris has a JSON API
  if (platform === "actiris") {
    return scrapeActirisApi(url);
  }

  // Default: fetch + cheerio
  const html = await scrapeWithFetch(url);
  return extractFromHtml(html, platform);
}
