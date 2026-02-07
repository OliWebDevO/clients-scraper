/**
 * Website Technical Analyzer
 * Analyzes websites without AI - pure HTML/HTTP analysis
 * Returns a "needs redesign" score (higher = more likely to need a new website)
 */

import * as cheerio from "cheerio";
import { isAllowedUrl } from "@/lib/job-description-scraper";

export interface WebsiteAnalysis {
  url: string;
  score: number; // 0-100, higher = worse site = better prospect
  checks: {
    hasHttps: boolean;
    hasViewport: boolean;
    hasMobileOptimization: boolean;
    copyrightYear: number | null;
    hasDeprecatedTags: boolean;
    hasModernMeta: boolean;
    loadTimeMs: number | null;
    hasInlineStyles: boolean;
    hasFavicon: boolean;
    hasAccessibility: boolean;
  };
  issues: string[];
}

const DEPRECATED_TAGS = [
  "font",
  "center",
  "marquee",
  "blink",
  "frame",
  "frameset",
  "applet",
  "basefont",
  "big",
  "strike",
  "tt",
];

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function analyzeWebsite(url: string): Promise<WebsiteAnalysis | null> {
  const issues: string[] = [];
  const checks: WebsiteAnalysis["checks"] = {
    hasHttps: false,
    hasViewport: false,
    hasMobileOptimization: false,
    copyrightYear: null,
    hasDeprecatedTags: false,
    hasModernMeta: false,
    loadTimeMs: null,
    hasInlineStyles: false,
    hasFavicon: false,
    hasAccessibility: false,
  };

  try {
    // Normalize URL
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
      normalizedUrl = "https://" + normalizedUrl;
    }

    // SSRF protection: block private/internal URLs
    if (!isAllowedUrl(normalizedUrl)) {
      console.warn(`Blocked SSRF attempt for URL: ${normalizedUrl}`);
      return null;
    }

    // Check HTTPS
    checks.hasHttps = normalizedUrl.startsWith("https://");
    if (!checks.hasHttps) {
      issues.push("Pas de HTTPS - site non sécurisé");
    }

    // Fetch the page with timeout and manual redirect handling
    const startTime = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const MAX_REDIRECTS = 3;

    let response: Response;
    let fetchUrl = normalizedUrl;

    async function fetchWithSafeRedirects(
      url: string,
      options: RequestInit
    ): Promise<Response> {
      let currentUrl = url;
      for (let i = 0; i <= MAX_REDIRECTS; i++) {
        const res = await fetch(currentUrl, { ...options, redirect: "manual" });
        if (res.status >= 300 && res.status < 400) {
          const location = res.headers.get("location");
          if (!location) {
            throw new Error(`Redirect with no Location header from ${currentUrl}`);
          }
          const redirectUrl = new URL(location, currentUrl).toString();
          if (!isAllowedUrl(redirectUrl)) {
            throw new Error("Redirect to disallowed URL blocked");
          }
          currentUrl = redirectUrl;
          continue;
        }
        return res;
      }
      throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
    }

    try {
      response = await fetchWithSafeRedirects(fetchUrl, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "fr-BE,fr;q=0.9,en;q=0.8",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
    } catch {
      clearTimeout(timeout);
      // Try HTTP if HTTPS fails
      if (normalizedUrl.startsWith("https://")) {
        const httpUrl = normalizedUrl.replace("https://", "http://");
        try {
          response = await fetchWithSafeRedirects(httpUrl, {
            headers: { "User-Agent": USER_AGENT },
            signal: AbortSignal.timeout(8000),
          });
          checks.hasHttps = false;
          issues.push("HTTPS ne fonctionne pas - repli sur HTTP");
          normalizedUrl = httpUrl;
        } catch {
          return null;
        }
      } else {
        return null;
      }
    }

    checks.loadTimeMs = Date.now() - startTime;

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Check viewport meta tag (responsive/mobile)
    const viewportMeta = $('meta[name="viewport"]').attr("content");
    checks.hasViewport = !!viewportMeta;
    if (!checks.hasViewport) {
      issues.push("Pas de viewport - non adapté mobile");
    }

    // Check for mobile optimization indicators
    const hasMobileMediaQueries =
      html.includes("@media") && (html.includes("max-width") || html.includes("min-width"));
    const hasResponsiveImages = $("img[srcset], picture source").length > 0;
    const hasFlexOrGrid =
      html.includes("display:flex") ||
      html.includes("display: flex") ||
      html.includes("display:grid") ||
      html.includes("display: grid") ||
      html.includes("flexbox");
    const hasBootstrap = html.includes("bootstrap") || $('[class*="col-"]').length > 0;
    const hasTailwind = html.includes("tailwind") || $('[class*="sm:"], [class*="md:"], [class*="lg:"]').length > 0;

    checks.hasMobileOptimization =
      checks.hasViewport && (hasMobileMediaQueries || hasResponsiveImages || hasFlexOrGrid || hasBootstrap || hasTailwind);

    if (!checks.hasMobileOptimization && checks.hasViewport) {
      issues.push("Optimisation mobile limitée");
    } else if (!checks.hasViewport) {
      issues.push("Probablement pas responsive");
    }

    // Check for deprecated HTML tags
    for (const tag of DEPRECATED_TAGS) {
      if ($(tag).length > 0) {
        checks.hasDeprecatedTags = true;
        issues.push(`Utilise balise obsolète <${tag}>`);
        break;
      }
    }

    // Check for tables used for layout
    const tables = $("table");
    let tablesForLayout = 0;
    tables.each((_, el) => {
      const table = $(el);
      if (!table.find("th").length && !table.attr("role")) {
        tablesForLayout++;
      }
    });
    if (tablesForLayout > 2) {
      issues.push("Utilise des tables pour la mise en page");
      checks.hasDeprecatedTags = true;
    }

    // Check modern meta tags
    const hasOgTags = $('meta[property^="og:"]').length > 0;
    const hasTwitterCards = $('meta[name^="twitter:"]').length > 0;
    const hasDescription = $('meta[name="description"]').attr("content");
    checks.hasModernMeta = hasOgTags || hasTwitterCards || !!hasDescription;
    if (!checks.hasModernMeta) {
      issues.push("Pas de meta tags modernes (SEO faible)");
    }

    // Check copyright year in footer
    const bodyText = $("body").text();
    const copyrightMatch = bodyText.match(/©\s*(\d{4})|copyright\s*(\d{4})/i);
    if (copyrightMatch) {
      checks.copyrightYear = parseInt(copyrightMatch[1] || copyrightMatch[2]);
      const currentYear = new Date().getFullYear();
      if (checks.copyrightYear < currentYear - 2) {
        issues.push(`Copyright obsolète (${checks.copyrightYear})`);
      }
    }

    // Check for excessive inline styles
    const elementsWithInlineStyles = $("[style]").length;
    const totalElements = $("*").length;
    checks.hasInlineStyles = totalElements > 0 && elementsWithInlineStyles / totalElements > 0.15;
    if (checks.hasInlineStyles) {
      issues.push("Trop de styles inline (code de mauvaise qualité)");
    }

    // Check favicon
    checks.hasFavicon =
      $('link[rel="icon"]').length > 0 ||
      $('link[rel="shortcut icon"]').length > 0 ||
      $('link[rel="apple-touch-icon"]').length > 0;
    if (!checks.hasFavicon) {
      issues.push("Pas de favicon");
    }

    // Check basic accessibility
    const imagesWithAlt = $("img[alt]").length;
    const totalImages = $("img").length;
    const hasAriaLabels = $("[aria-label], [aria-labelledby], [role]").length > 0;
    checks.hasAccessibility = hasAriaLabels || (totalImages > 0 && imagesWithAlt / totalImages > 0.5);
    if (!checks.hasAccessibility && totalImages > 3) {
      issues.push("Accessibilité faible (alt manquants)");
    }

    // Check load time
    if (checks.loadTimeMs && checks.loadTimeMs > 5000) {
      issues.push(`Temps de chargement lent (${Math.round(checks.loadTimeMs / 1000)}s)`);
    }

    // Calculate score
    const score = calculateScore(checks);

    return {
      url: normalizedUrl,
      score,
      checks,
      issues,
    };
  } catch (error) {
    console.error(`Erreur analyse ${url}:`, error);
    return null;
  }
}

function calculateScore(checks: WebsiteAnalysis["checks"]): number {
  let score = 0;

  // HTTPS (important)
  if (!checks.hasHttps) score += 20;

  // Mobile/Responsive (very important for your business)
  if (!checks.hasViewport) score += 25;
  else if (!checks.hasMobileOptimization) score += 15;

  // Deprecated tags
  if (checks.hasDeprecatedTags) score += 15;

  // Modern meta tags
  if (!checks.hasModernMeta) score += 10;

  // Copyright year
  if (checks.copyrightYear) {
    const yearsOld = new Date().getFullYear() - checks.copyrightYear;
    if (yearsOld >= 5) score += 15;
    else if (yearsOld >= 3) score += 10;
    else if (yearsOld >= 2) score += 5;
  }

  // Inline styles
  if (checks.hasInlineStyles) score += 5;

  // No favicon
  if (!checks.hasFavicon) score += 5;

  // Poor accessibility
  if (!checks.hasAccessibility) score += 5;

  // Slow load time
  if (checks.loadTimeMs) {
    if (checks.loadTimeMs > 8000) score += 10;
    else if (checks.loadTimeMs > 5000) score += 5;
  }

  return Math.min(100, score);
}

/**
 * Analyze multiple websites in parallel with rate limiting
 */
export async function analyzeWebsites(
  urls: (string | null | undefined)[],
  concurrency: number = 5
): Promise<Map<string, WebsiteAnalysis | null>> {
  const results = new Map<string, WebsiteAnalysis | null>();
  const validUrls = urls.filter((url): url is string => !!url);

  for (let i = 0; i < validUrls.length; i += concurrency) {
    const batch = validUrls.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (url) => {
        const analysis = await analyzeWebsite(url);
        return { url, analysis };
      })
    );

    for (const { url, analysis } of batchResults) {
      results.set(url, analysis);
    }

    // Small delay between batches
    if (i + concurrency < validUrls.length) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  return results;
}
