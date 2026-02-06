import { ICTJobScraper } from "./ictjob";
import { IndeedScraper } from "./indeed";
import { JobatScraper } from "./jobat";
import { ActirisScraper } from "./actiris";
import { JobsoraScraper } from "./jobsora";
import { LinkedInScraper } from "./linkedin";
import type { JobPlatform } from "@/lib/types";
import type { ScraperResult } from "./base";

interface Scraper {
  scrape(keywords: string[], location?: string): Promise<ScraperResult>;
}

export function getScraperForPlatform(platform: JobPlatform): Scraper {
  switch (platform) {
    case "ictjob":
      return new ICTJobScraper();
    case "indeed":
      return new IndeedScraper();
    case "jobat":
      return new JobatScraper();
    case "actiris":
      return new ActirisScraper();
    case "jobsora":
      return new JobsoraScraper();
    case "linkedin":
      return new LinkedInScraper();
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}

export {
  ICTJobScraper,
  IndeedScraper,
  JobatScraper,
  ActirisScraper,
  JobsoraScraper,
  LinkedInScraper,
};
