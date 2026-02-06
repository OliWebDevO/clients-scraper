import { BaseScraper, ScraperResult, randomDelay } from "./base";
import type { Job } from "@/lib/types";

interface ActirisItem {
  reference: string;
  titreFr: string | null;
  titreNl: string | null;
  employeur: { nomFr: string | null; nomNl: string | null } | null;
  communeFr: string | null;
  communeNl: string | null;
  codePostal: string | null;
  typeContrat: string | null;
  typeContratLibelle: string | null;
  dateCreation: string | null;
}

export class ActirisScraper extends BaseScraper {
  constructor() {
    super("Actiris", "https://www.actiris.brussels");
  }

  async scrape(keywords: string[], location?: string): Promise<ScraperResult> {
    const jobs: Partial<Job>[] = [];

    try {
      for (const keyword of keywords) {
        try {
          await randomDelay(2000, 4000);

          const response = await fetch(
            `${this.baseUrl}/Umbraco/api/OffersApi/GetAllOffers`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Accept-Language": "fr",
                "User-Agent":
                  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              },
              body: JSON.stringify({
                offreFilter: { texte: keyword },
                pageOption: { page: 1 },
              }),
            }
          );

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();
          const items: ActirisItem[] = data.items || [];

          for (const item of items) {
            const title = item.titreFr || item.titreNl;
            if (!title) continue;

            const url = `${this.baseUrl}/fr/citoyens/trouver-un-emploi/offres-d-emploi/${item.reference}`;

            // Check for duplicates
            if (jobs.some((j) => j.url === url)) continue;

            const matchedKeywords = this.matchesKeyword(title, keywords);
            if (matchedKeywords.length === 0) {
              matchedKeywords.push(keyword);
            }

            const company = item.employeur?.nomFr || item.employeur?.nomNl || null;
            const jobLocation = item.communeFr || item.communeNl || "Brussels";

            jobs.push({
              title,
              company,
              location: jobLocation,
              url,
              source: this.source,
              keywords_matched: matchedKeywords,
              posted_at: item.dateCreation || undefined,
            });
          }
        } catch (err) {
          console.error(`Error fetching Actiris for keyword "${keyword}":`, err);
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
}
