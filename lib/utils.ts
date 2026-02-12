import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string | null): string {
  if (!date) return "N/A";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatRelativeTime(date: Date | string | null): string {
  if (!date) return "Never";
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return formatDate(d);
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomDelay(min: number, max: number): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return delay(ms);
}

export function parseRating(ratingStr: string | null | undefined): number | null {
  if (!ratingStr) return null;
  const match = ratingStr.match(/[\d.]+/);
  if (match) {
    const rating = parseFloat(match[0]);
    return rating > 0 && rating <= 5 ? rating : null;
  }
  return null;
}

export function parseReviewCount(reviewStr: string | null | undefined): number | null {
  if (!reviewStr) return null;
  const cleaned = reviewStr.replace(/[^\d]/g, "");
  const count = parseInt(cleaned, 10);
  return isNaN(count) ? null : count;
}

export function extractCity(address: string | null | undefined): string | null {
  if (!address) return null;
  const parts = address.split(",").map((p) => p.trim());
  return parts.length >= 2 ? parts[parts.length - 2] : parts[0] || null;
}

export function replaceTemplateVariables(
  template: string,
  variables: Record<string, string | null | undefined>
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
    const safe = (value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    result = result.replace(regex, safe);
  }
  return result;
}

/**
 * Re-apply the blank line spacing pattern from the original text onto the AI-generated text.
 * The AI often collapses multiple blank lines into single ones - this restores the original layout.
 */
export function reapplySpacing(original: string, generated: string): string {
  const originalGaps = original.match(/\n{2,}/g) || [];

  let gapIndex = 0;
  return generated.replace(/\n{2,}/g, () => {
    if (gapIndex < originalGaps.length) {
      return originalGaps[gapIndex++];
    }
    return "\n\n";
  });
}

/**
 * Convert a Google Maps category into a natural French phrase.
 * Returns { prefix, label } where prefix is plain text and label is the bold part.
 * Example: "Restaurant" → { prefix: "de", label: "la Restauration" }
 */
export function categoryToPhrase(category: string | null | undefined): { prefix: string; label: string } {
  if (!category) return { prefix: "de", label: "votre secteur" };

  const lower = category.toLowerCase().trim();

  const mapping: Record<string, { prefix: string; label: string }> = {
    // Alimentation
    "restaurant": { prefix: "de", label: "la Restauration" },
    "boulangerie": { prefix: "de", label: "la Boulangerie" },
    "pâtisserie": { prefix: "de", label: "la Pâtisserie" },
    "patisserie": { prefix: "de", label: "la Pâtisserie" },
    "boucherie": { prefix: "de", label: "la Boucherie" },
    "traiteur": { prefix: "de", label: "la Restauration" },
    "café": { prefix: "de", label: "la Restauration" },
    "cafe": { prefix: "de", label: "la Restauration" },
    "bar": { prefix: "de", label: "la Restauration" },
    "pizzeria": { prefix: "de", label: "la Restauration" },
    "brasserie": { prefix: "de", label: "la Restauration" },
    "snack-bar": { prefix: "de", label: "la Restauration" },
    "fast food": { prefix: "de", label: "la Restauration rapide" },
    "food truck": { prefix: "de", label: "la Restauration" },
    "glacier": { prefix: "de", label: "la Restauration" },
    "chocolatier": { prefix: "de", label: "la Chocolaterie" },

    // Beauté / Bien-être
    "coiffeur": { prefix: "de", label: "la Coiffure" },
    "salon de coiffure": { prefix: "de", label: "la Coiffure" },
    "barbier": { prefix: "de", label: "la Coiffure" },
    "barber shop": { prefix: "de", label: "la Coiffure" },
    "institut de beauté": { prefix: "de", label: "la Beauté" },
    "institut de beaute": { prefix: "de", label: "la Beauté" },
    "spa": { prefix: "du", label: "Bien-être" },
    "esthéticienne": { prefix: "de", label: "l'Esthétique" },
    "estheticienne": { prefix: "de", label: "l'Esthétique" },
    "manucure": { prefix: "de", label: "la Beauté" },
    "onglerie": { prefix: "de", label: "la Beauté" },
    "salon de beauté": { prefix: "de", label: "la Beauté" },
    "salon de beaute": { prefix: "de", label: "la Beauté" },
    "tatoueur": { prefix: "du", label: "Tatouage" },

    // Santé
    "dentiste": { prefix: "de", label: "la Dentisterie" },
    "médecin": { prefix: "de", label: "la Médecine" },
    "medecin": { prefix: "de", label: "la Médecine" },
    "pharmacie": { prefix: "de", label: "la Pharmacie" },
    "kinésithérapeute": { prefix: "de", label: "la Kinésithérapie" },
    "kinesitherapeute": { prefix: "de", label: "la Kinésithérapie" },
    "ostéopathe": { prefix: "de", label: "l'Ostéopathie" },
    "osteopathe": { prefix: "de", label: "l'Ostéopathie" },
    "opticien": { prefix: "de", label: "l'Optique" },
    "vétérinaire": { prefix: "de", label: "la Médecine vétérinaire" },
    "veterinaire": { prefix: "de", label: "la Médecine vétérinaire" },
    "psychologue": { prefix: "de", label: "la Psychologie" },

    // Commerce
    "fleuriste": { prefix: "de", label: "la Fleuristerie" },
    "bijouterie": { prefix: "de", label: "la Bijouterie" },
    "librairie": { prefix: "de", label: "la Librairie" },
    "magasin de vêtements": { prefix: "de", label: "la Mode" },
    "magasin de vetements": { prefix: "de", label: "la Mode" },
    "boutique": { prefix: "de", label: "la Mode" },
    "épicerie": { prefix: "de", label: "l'Alimentation" },
    "epicerie": { prefix: "de", label: "l'Alimentation" },
    "supermarché": { prefix: "de", label: "la Distribution" },
    "supermarche": { prefix: "de", label: "la Distribution" },
    "quincaillerie": { prefix: "de", label: "la Quincaillerie" },

    // Services
    "avocat": { prefix: "du", label: "Droit" },
    "cabinet d'avocats": { prefix: "du", label: "Droit" },
    "comptable": { prefix: "de", label: "la Comptabilité" },
    "notaire": { prefix: "du", label: "Notariat" },
    "assurance": { prefix: "de", label: "l'Assurance" },
    "agence immobilière": { prefix: "de", label: "l'Immobilier" },
    "agence immobiliere": { prefix: "de", label: "l'Immobilier" },
    "banque": { prefix: "de", label: "la Banque" },
    "agence de voyage": { prefix: "du", label: "Tourisme" },

    // Artisanat / BTP
    "plombier": { prefix: "de", label: "la Plomberie" },
    "électricien": { prefix: "de", label: "l'Électricité" },
    "electricien": { prefix: "de", label: "l'Électricité" },
    "peintre": { prefix: "de", label: "la Peinture" },
    "menuisier": { prefix: "de", label: "la Menuiserie" },
    "serrurier": { prefix: "de", label: "la Serrurerie" },
    "couvreur": { prefix: "de", label: "la Couverture" },
    "carreleur": { prefix: "du", label: "Carrelage" },
    "maçon": { prefix: "de", label: "la Maçonnerie" },
    "macon": { prefix: "de", label: "la Maçonnerie" },
    "jardinier": { prefix: "du", label: "Jardinage" },
    "paysagiste": { prefix: "de", label: "l'Aménagement paysager" },
    "entreprise de construction": { prefix: "de", label: "la Construction" },
    "chauffagiste": { prefix: "du", label: "Chauffage" },

    // Auto
    "garage automobile": { prefix: "de", label: "l'Automobile" },
    "garage": { prefix: "de", label: "l'Automobile" },
    "concessionnaire automobile": { prefix: "de", label: "l'Automobile" },
    "carrosserie": { prefix: "de", label: "la Carrosserie" },
    "auto-école": { prefix: "de", label: "l'Auto-école" },
    "auto-ecole": { prefix: "de", label: "l'Auto-école" },

    // Sport / Loisirs
    "salle de sport": { prefix: "du", label: "Fitness" },
    "fitness": { prefix: "du", label: "Fitness" },
    "yoga": { prefix: "du", label: "Yoga" },
    "club de sport": { prefix: "du", label: "Sport" },

    // Informatique / Tech
    "réparation informatique": { prefix: "de", label: "l'Informatique" },
    "reparation informatique": { prefix: "de", label: "l'Informatique" },
    "magasin d'informatique": { prefix: "de", label: "l'Informatique" },

    // Nettoyage
    "pressing": { prefix: "du", label: "Pressing" },
    "nettoyage": { prefix: "du", label: "Nettoyage" },
    "entreprise de nettoyage": { prefix: "du", label: "Nettoyage" },

    // Éducation
    "école": { prefix: "de", label: "l'Enseignement" },
    "ecole": { prefix: "de", label: "l'Enseignement" },
    "crèche": { prefix: "de", label: "la Petite enfance" },
    "creche": { prefix: "de", label: "la Petite enfance" },
    "auto école": { prefix: "de", label: "l'Auto-école" },
  };

  // Exact match
  if (mapping[lower]) return mapping[lower];

  // Partial match: check if the category contains a known key
  for (const [key, value] of Object.entries(mapping)) {
    if (lower.includes(key)) return value;
  }

  // Fallback: capitalize category
  const capitalized = category.charAt(0).toUpperCase() + category.slice(1);
  return { prefix: "de", label: `votre secteur (${capitalized})` };
}

/**
 * Convert a city name to its French equivalent.
 * Handles English, Dutch, and common alternate spellings for Belgian cities.
 */
export function cityToFrench(city: string | null | undefined): string {
  if (!city) return "votre ville";

  const trimmed = city.trim();
  const lower = trimmed.toLowerCase();

  const mapping: Record<string, string> = {
    // Brussels
    "brussels": "Bruxelles",
    "brussel": "Bruxelles",
    "bruxelles": "Bruxelles",

    // Antwerp
    "antwerp": "Anvers",
    "antwerpen": "Anvers",
    "anvers": "Anvers",

    // Ghent
    "ghent": "Gand",
    "gent": "Gand",
    "gand": "Gand",

    // Bruges
    "bruges": "Bruges",
    "brugge": "Bruges",

    // Liège
    "liège": "Liège",
    "liege": "Liège",
    "luik": "Liège",

    // Namur
    "namur": "Namur",
    "namen": "Namur",

    // Leuven
    "leuven": "Louvain",
    "louvain": "Louvain",

    // Mons
    "mons": "Mons",
    "bergen": "Mons",

    // Charleroi
    "charleroi": "Charleroi",

    // Mechelen
    "mechelen": "Malines",
    "malines": "Malines",

    // Hasselt
    "hasselt": "Hasselt",

    // Tournai
    "tournai": "Tournai",
    "doornik": "Tournai",

    // Kortrijk
    "kortrijk": "Courtrai",
    "courtrai": "Courtrai",

    // Aalst
    "aalst": "Alost",
    "alost": "Alost",

    // Sint-Niklaas
    "sint-niklaas": "Saint-Nicolas",
    "saint-nicolas": "Saint-Nicolas",

    // Wavre
    "wavre": "Wavre",
    "waver": "Wavre",

    // Arlon
    "arlon": "Arlon",
    "aarlen": "Arlon",

    // Verviers
    "verviers": "Verviers",

    // Ottignies-Louvain-la-Neuve
    "louvain-la-neuve": "Louvain-la-Neuve",
    "ottignies-louvain-la-neuve": "Ottignies-Louvain-la-Neuve",

    // Waterloo
    "waterloo": "Waterloo",

    // Nivelles
    "nivelles": "Nivelles",
    "nijvel": "Nivelles",

    // Ostend
    "ostend": "Ostende",
    "oostende": "Ostende",
    "ostende": "Ostende",

    // Ixelles / Brussels communes
    "ixelles": "Ixelles",
    "elsene": "Ixelles",
    "schaerbeek": "Schaerbeek",
    "schaarbeek": "Schaerbeek",
    "uccle": "Uccle",
    "ukkel": "Uccle",
    "etterbeek": "Etterbeek",
    "anderlecht": "Anderlecht",
    "molenbeek-saint-jean": "Molenbeek-Saint-Jean",
    "sint-jans-molenbeek": "Molenbeek-Saint-Jean",
    "woluwe-saint-lambert": "Woluwe-Saint-Lambert",
    "sint-lambrechts-woluwe": "Woluwe-Saint-Lambert",
    "woluwe-saint-pierre": "Woluwe-Saint-Pierre",
    "sint-pieters-woluwe": "Woluwe-Saint-Pierre",
    "forest": "Forest",
    "vorst": "Forest",
    "saint-gilles": "Saint-Gilles",
    "sint-gillis": "Saint-Gilles",
    "jette": "Jette",
    "auderghem": "Auderghem",
    "oudergem": "Auderghem",
    "watermael-boitsfort": "Watermael-Boitsfort",
    "watermaal-bosvoorde": "Watermael-Boitsfort",
    "evere": "Evere",
    "ganshoren": "Ganshoren",
    "koekelberg": "Koekelberg",
    "berchem-sainte-agathe": "Berchem-Sainte-Agathe",
    "sint-agatha-berchem": "Berchem-Sainte-Agathe",
  };

  if (mapping[lower]) return mapping[lower];

  // Return original with first letter capitalized if no match
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  filename: string
): void {
  if (data.length === 0) return;

  const headers = Object.keys(data[0]);
  const csvRows: string[] = [];

  csvRows.push(headers.join(","));

  for (const row of data) {
    const values = headers.map((header) => {
      const value = row[header];
      const stringValue = value === null || value === undefined ? "" : String(value);
      const escaped = stringValue.replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(","));
  }

  const csvString = csvRows.join("\n");
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}
