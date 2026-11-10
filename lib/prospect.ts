/**
 * Prospect personalisation: what kind of web presence a business has,
 * what a website brings to its sector, and the short first-contact email.
 * Pure functions — safe to use on the client and the server.
 */
import { cityToFrench, extractCity } from "./utils";

export type WebsiteProfile = "none" | "social" | "booking" | "outdated" | "ok";

export interface ProspectData {
  businessName: string;
  rating: number | null;
  reviewCount: number | null;
  category: string | null;
  address: string | null;
  hasWebsite: boolean;
  websiteUrl?: string | null;
  websiteScore?: number | null;
  websiteIssues?: string[] | null;
  source?: string | null; // 'kbo' / 'kbo_person' (sole trader under own name) = found in the company register, not on Google
  companyStartDate?: string | null; // ISO date, from KBO
}

/* ── Web presence ── */

// Hostname fragment → how to name it in the email
const SOCIAL_PLATFORMS: Record<string, string> = {
  "facebook.com": "votre page Facebook",
  "fb.com": "votre page Facebook",
  "fb.me": "votre page Facebook",
  "instagram.com": "votre compte Instagram",
  "tiktok.com": "votre compte TikTok",
  "linktr.ee": "votre page Linktree",
  "linkedin.com": "votre page LinkedIn",
  "business.site": "votre fiche Google",
  "g.page": "votre fiche Google",
  "wa.me": "WhatsApp",
};

const BOOKING_PLATFORMS: Record<string, string> = {
  "treatwell.": "Treatwell",
  "planity.": "Planity",
  "salonkee.": "Salonkee",
  "fresha.": "Fresha",
  "booksy.": "Booksy",
  "thefork.": "TheFork",
  "lafourchette.": "TheFork",
  "resengo.": "Resengo",
  "zenchef.": "Zenchef",
  "deliveroo.": "Deliveroo",
  "ubereats.": "Uber Eats",
  "takeaway.com": "Takeaway",
  "doctolib.": "Doctolib",
  "doctoranytime.": "Doctoranytime",
  "calendly.com": "Calendly",
  "setmore.com": "Setmore",
};

function hostnameOf(url: string): string | null {
  try {
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return new URL(normalized).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Name of the social/booking platform behind a URL, or null for a real website */
export function getPlatform(url: string | null | undefined): { kind: "social" | "booking"; label: string } | null {
  if (!url) return null;
  const host = hostnameOf(url);
  if (!host) return null;
  for (const [fragment, label] of Object.entries(SOCIAL_PLATFORMS)) {
    if (host === fragment || host.endsWith(`.${fragment}`)) return { kind: "social", label };
  }
  for (const [fragment, label] of Object.entries(BOOKING_PLATFORMS)) {
    if (host.includes(fragment)) return { kind: "booking", label };
  }
  return null;
}

/** Score below which a real website is considered fine (matches the scraper filter) */
export const GOOD_WEBSITE_SCORE = 25;

export function getWebsiteProfile(data: Pick<ProspectData, "hasWebsite" | "websiteUrl" | "websiteScore">): WebsiteProfile {
  if (!data.hasWebsite || !data.websiteUrl) return "none";
  const platform = getPlatform(data.websiteUrl);
  if (platform) return platform.kind;
  if (data.websiteScore != null && data.websiteScore < GOOD_WEBSITE_SCORE) return "ok";
  return "outdated";
}

export function websiteDomain(url: string | null | undefined): string | null {
  return url ? hostnameOf(url) : null;
}

/* ── Website issues in plain French (for the business owner, not a developer) ── */

// Phrased as opportunities, never as criticism: they follow "quelques pistes pour … :"
const ISSUE_PHRASES: Array<{ match: RegExp; phrase: string }> = [
  { match: /viewport|responsive|mobile/i, phrase: "une version pensée pour le mobile, puisque la majorité des visiteurs arrivent aujourd'hui depuis un téléphone" },
  { match: /https/i, phrase: "le passage en HTTPS, pour que tous les navigateurs l'affichent comme sécurisé" },
  { match: /chargement lent/i, phrase: "un affichage plus rapide, pour garder chaque visiteur jusqu'à la prise de contact" },
  { match: /copyright obsolète/i, phrase: "un contenu rafraîchi, qui reflète votre activité d'aujourd'hui" },
  { match: /obsolète|tables pour la mise en page/i, phrase: "une base technique moderne, plus simple à faire évoluer" },
  { match: /meta tags|seo/i, phrase: "un meilleur référencement, pour ressortir davantage dans les recherches Google" },
];

/** Improvement ideas already contain commas: "a, ainsi qu'b" reads better than "a et b" */
export function joinIdeas(items: string[]): string {
  if (items.length <= 1) return items.join("");
  const last = items[items.length - 1];
  const link = /^[aeiouyéèêh]/i.test(last) ? "ainsi qu'" : "ainsi que ";
  return `${items.slice(0, -1).join(", ")}, ${link}${last}`;
}

/** Up to `max` improvement ideas in plain French, most persuasive first */
export function plainIssues(issues: string[] | null | undefined, max = 2): string[] {
  if (!issues?.length) return [];
  const result: string[] = [];
  for (const { match, phrase } of ISSUE_PHRASES) {
    if (result.length >= max) break;
    if (issues.some((i) => match.test(i)) && !result.includes(phrase)) result.push(phrase);
  }
  return result;
}

/* ── Sector pitch ── */

interface SectorPitch {
  /** What a website concretely brings in this sector (one sentence) */
  benefit: string;
  /** What a site would let visitors do; read after "de": "permettrait de …" */
  showcase: string;
}

const SECTOR_PITCHES: Array<{ match: RegExp; pitch: SectorPitch }> = [
  {
    match: /restaur|coffee|caf[eé]|salon de th[eé]|tea\b|lunch|brunch|juice|bubble|brasserie|d[eé]bits? de boissons|pizzeria|bistro|trattoria|caf[eé]|bar\b|snack|friterie|traiteur|sushi|kebab|burger|tapas|food/i,
    pitch: { benefit: "Pour un établissement comme le vôtre, un site avec votre carte à jour, vos photos et la réservation en ligne fait souvent la différence quand un client hésite entre deux adresses.", showcase: "découvrir votre carte, vos horaires ou l'ambiance du lieu" },
  },
  {
    match: /coiff|barb|beaut|esth[eé]ti|ongle|nail|manucure|maquill|spa\b|tatou|piercing|cils|bronzage/i,
    pitch: { benefit: "Pour un salon, un site avec vos prestations, vos tarifs et la prise de rendez-vous en ligne remplit l'agenda sans passer vos journées au téléphone.", showcase: "voir vos prestations, vos tarifs ou de prendre rendez-vous" },
  },
  {
    match: /pharmac|apotheek|parapharm/i,
    pitch: {
      benefit: "Pour une pharmacie, un site avec vos horaires, vos services (conseils, préparations, location de matériel…) et vos coordonnées aide les patients du quartier à venir chez vous plutôt qu'ailleurs.",
      showcase: "connaître vos horaires, vos services ou de vous contacter",
    },
  },
  {
    match: /massage|kin[eé]|ost[eé]o|psych|th[eé]rap|sophro|naturo|di[eé]t[eé]|yoga|pilates|m[eé]decin|dentist|infirm|podolog|logop|sant[eé]/i,
    pitch: { benefit: "Pour un cabinet, un site clair avec vos spécialités, vos horaires et la prise de rendez-vous rassure les nouveaux patients avant même le premier contact.", showcase: "découvrir vos spécialités ou de prendre rendez-vous" },
  },
  {
    match: /fitness|salle de sport|sport|crossfit|boxe|danse|arts martiaux|coach/i,
    pitch: { benefit: "Pour une salle ou un coach, un site avec le planning des cours, les tarifs et l'inscription en ligne transforme les curieux en membres.", showcase: "voir le planning des cours, vos tarifs ou de s'inscrire" },
  },
  {
    match: /boulang|p[aâ]tiss|boucher|charcut|fromag|chocolat|traiteur|[eé]picerie|primeur|caviste|vin|glacier|torr[eé]fact/i,
    pitch: { benefit: "Pour un commerce de bouche, un site avec vos produits, vos horaires et la commande à emporter donne envie de passer la porte.", showcase: "découvrir vos produits, vos horaires ou de commander" },
  },
  {
    match: /plomb|[eé]lectric|chauff|menuis|peintr|carrel|toitur|couvreur|ma[cç]on|construct|r[eé]nov|jardin|parquet|vitr|serrur|chassis|ch[aâ]ssis|isolat|d[eé]m[eé]nag|nettoyage|entrepreneur|artisan/i,
    pitch: { benefit: "Pour un artisan, un site avec vos réalisations en photos et un formulaire de demande de devis inspire confiance et vous amène des chantiers sans démarchage.", showcase: "voir vos réalisations ou de vous demander un devis" },
  },
  {
    match: /garage|carross|auto|moto|v[eé]lo|pneu|d[eé]pann/i,
    pitch: { benefit: "Pour un garage, un site avec vos services, vos tarifs indicatifs et la prise de rendez-vous en ligne fait gagner du temps à vos clients comme à vous.", showcase: "voir vos services ou de prendre rendez-vous" },
  },
  {
    match: /comptab|fiduciaire|avocat|notaire|immobili|assurance|architect|conseil|consult|traduct|agence/i,
    pitch: { benefit: "Pour un cabinet de services, un site professionnel qui présente clairement votre expertise est souvent ce qu'un futur client consulte avant de vous appeler.", showcase: "comprendre votre expertise ou de vous contacter" },
  },
  {
    match: /boutique|magasin|v[eê]tement|mode|chaussure|bijou|fleur|librair|cadeau|d[eé]co|meuble|opticien|animal|toilett/i,
    pitch: { benefit: "Pour une boutique, un site qui montre vos produits et votre univers donne envie de venir — et peut aussi vendre en ligne quand le magasin est fermé.", showcase: "découvrir vos produits et votre univers" },
  },
];

const DEFAULT_PITCH: SectorPitch = {
  benefit: "Un site clair, rapide et bien référencé permet aux personnes qui vous cherchent sur Google de vous trouver, de vous faire confiance et de vous contacter en un clic.",
  showcase: "en savoir plus sur vous ou de vous contacter facilement",
};

export function getSectorPitch(category: string | null | undefined): SectorPitch {
  if (!category) return DEFAULT_PITCH;
  return SECTOR_PITCHES.find((s) => s.match.test(category))?.pitch ?? DEFAULT_PITCH;
}

/* ── Reputation (only claim what is true) ── */

export function formatRating(rating: number): string {
  return rating.toLocaleString("fr-BE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** A reputation phrase, or null when the rating doesn't justify a compliment */
export function reputationPhrase(rating: number | null, reviewCount: number | null): string | null {
  if (rating == null || reviewCount == null) return null;
  if (rating >= 4.5 && reviewCount >= 20) return `vos ${reviewCount} avis Google à ${formatRating(rating)}/5`;
  if (rating >= 4.2 && reviewCount >= 10) return `votre très bonne réputation sur Google (${formatRating(rating)}/5)`;
  return null;
}

/* ── Name & city helpers ── */

/** Remove Google Maps suffixes like "Chez Marco - Ixelles" or "Salon X | Coiffeur Bruxelles" */
/** "FRITERIE « CHEZ LORIS »" → "Friterie « Chez Loris »"; short words (GA, ATZ, R.E.) stay as acronyms */
function fixAllCaps(name: string): string {
  const letters = name.replace(/[^\p{L}]/gu, "");
  if (letters.length < 5 || letters !== letters.toUpperCase()) return name;
  return name.replace(/[\p{L}][\p{L}'’]*/gu, (word, offset: number) => {
    if (word.length <= 3 && offset !== 0 && !/^(DE|DU|DES|LA|LE|LES|ET|ET|AU|AUX|EN|VAN|DEN|DER)$/.test(word)) return word;
    if (word.length <= 3 && offset === 0 && !/^(LA|LE|LES|AU|AUX)$/.test(word)) return word;
    const lower = word.toLowerCase();
    const cased = offset !== 0 && /^(de|du|des|la|le|les|et|au|aux|en)$/.test(lower) ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    return cased.replace(/(['’])(\p{Ll})/u, (_m, apostrophe: string, letter: string) => apostrophe + letter.toUpperCase()); // L'Avenue
  });
}

// Built at runtime: the TS target (ES2017) rejects \p{…} in regex literals
const EMOJI = new RegExp("[\\p{Extended_Pictographic}\\uFE0F\\u200D]", "gu");

export function cleanBusinessName(name: string, city?: string | null): string {
  // Drop emojis ("Medphar Pharmacy💊") and the legal form, which nobody uses when talking about their own shop
  let cleaned = fixAllCaps(name)
    .replace(EMOJI, "")
    .replace(/\s{2,}/g, " ")
    .split(" | ")[0]
    .replace(/[\s,]+\(?(srl|sprl|sa|sc|scrl|snc|scs|asbl|bv|bvba|nv|cv|vof|vzw|comm\.?\s?v)\.?\)?$/i, "")
    .trim();
  const dash = cleaned.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (dash) {
    const tail = dash[2].toLowerCase();
    const isLocation =
      /bruxelles|brussel|brussels|belgique|belgium/.test(tail) || (!!city && tail.includes(city.toLowerCase()));
    if (isLocation) cleaned = dash[1].trim();
  }
  return cleaned;
}

export function getCity(address: string | null | undefined): string | null {
  const city = extractCity(address);
  return city ? cityToFrench(city) : null;
}

// Names that start with a common noun take an article: "le lancement de la Friterie « Chez Loris »"
const FEMININE_NOUNS = /^(friterie|boulangerie|boucherie|charcuterie|pâtisserie|patisserie|brasserie|pharmacie|épicerie|epicerie|librairie|maison|boutique|fromagerie|pizzeria|taverne|clinique|agence|société|societe|menuiserie|carrosserie|bijouterie|parfumerie|cave|cuisine|crèche|creche|école|ecole)\b/i;
const MASCULINE_NOUNS = /^(salon|restaurant|café|cafe|cabinet|garage|institut|atelier|studio|bar|bistro|bistrot|snack|traiteur|centre|comptoir|espace|hôtel|hotel|club|cercle|magasin|bureau)\b/i;

/** "Friterie X" → "la Friterie X"; with "de": "de la Friterie X", "du Salon X", "de l'Atelier X", "de NT Cooking" */
export function withArticle(name: string, preposition?: "de"): string {
  const vowel = /^[aeiouyéèêàâîôûh]/i.test(name);
  let article = "";
  if (FEMININE_NOUNS.test(name)) article = vowel ? "l'" : "la ";
  else if (MASCULINE_NOUNS.test(name)) article = vowel ? "l'" : "le ";
  if (preposition !== "de") return `${article}${name}`;
  if (article === "le ") return `du ${name}`;
  if (article) return `de ${article}${name}`;
  // No elision before a consonant-sounding Y ("de Yuka Coffee Bar")
  return /^[aeiouéèêàâîôû]/i.test(name) ? `d'${name}` : `de ${name}`;
}

/** Started within the last 12 months */
export function isRecentlyStarted(startDate: string | null | undefined): boolean {
  if (!startDate) return false;
  const started = new Date(startDate).getTime();
  return !Number.isNaN(started) && Date.now() - started < 365 * 86400000;
}

/* ── First-contact email (short, plain text) ── */

export const SENDER = {
  name: "Oliver Van Droogenbroeck",
  title: "Développeur web · Bruxelles",
  email: "webdev@olivervdb.com",
  website: "https://www.olivervdb.com/",
  portfolio: "https://www.olivervdb.com/fr#work", // "Projets" section: Annick, Fanal, Le Noyer, Les Arts
  // From SENDER_PHONE in .env.local (exposed to the browser via next.config.ts)
  phone: process.env.SENDER_PHONE || "",
};

/** 0465831107 → 0465 83 11 07 (Belgian mobile), other formats unchanged */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return /^04\d{8}$/.test(digits) ? digits.replace(/^(\d{4})(\d{2})(\d{2})(\d{2})$/, "$1 $2 $3 $4") : phone;
}

/** No email in the signature: they are replying to it already. The phone is the shortest path to a call. */
export function signature(): string {
  const contact = [SENDER.phone && formatPhone(SENDER.phone), SENDER.website].filter(Boolean).join(" · ");
  return `${SENDER.name}\n${SENDER.title}\n${contact}`;
}

/** Short cold email (~120 words): their numbers first, what they lose, then one concrete call to action */
export function generateFirstContactEmail(data: ProspectData): { subject: string; body: string } {
  const city = getCity(data.address);
  const name = cleanBusinessName(data.businessName, city);
  const profile = getWebsiteProfile(data);
  const platform = getPlatform(data.websiteUrl);
  const { showcase } = getSectorPitch(data.category);
  const fromKbo = !!data.source?.startsWith("kbo");
  const isPerson = data.source === "kbo_person";
  const strongReputation =
    data.rating != null && data.reviewCount != null && data.rating >= 4.4 && data.reviewCount >= 25;
  const goodRating = data.rating != null && data.reviewCount != null && data.rating >= 4.0 && data.reviewCount >= 5;
  const stars = data.rating != null ? formatRating(data.rating) : "";
  // No rating worth quoting: open with a question about their clients instead (never about my own search)
  const question = !fromKbo && !strongReputation && !goodRating;

  // 1. Hook: about them, with facts
  let hook: string;
  if (fromKbo) {
    hook = isRecentlyStarted(data.companyStartDate)
      ? `Félicitations pour le lancement ${isPerson ? "de votre activité" : withArticle(name, "de")}${city ? ` à ${city}` : ""} !`
      : `J'ai découvert ${isPerson ? "votre activité" : withArticle(name)}${city ? ` à ${city}` : ""} dans le registre des entreprises.`;
  } else if (strongReputation) {
    hook = `Avec ${data.reviewCount} avis à ${stars}/5 sur Google, ${name} jouit déjà d'une très belle réputation.`;
  } else if (goodRating) {
    hook = `Vos clients notent ${name} ${stars}/5 sur Google${city ? `, à ${city}` : ""}.`;
  } else {
    hook = `Petite question : quand un nouveau client entend parler de ${name}${city ? ` à ${city}` : ""}, que trouve-t-il en ligne ?`;
  }

  // 2. The opportunity, and 3. why it matters. Always positive: never criticise their business or site.
  let gap: string;
  let cost: string;
  let subject: string;
  const deShowcase = /^[aeiouéèêh]/i.test(showcase) ? `d'${showcase}` : `de ${showcase}`;
  const DIFFERENCE = `C'est souvent ce qui fait la différence quand un client hésite entre deux adresses.`;
  switch (profile) {
    case "social":
      gap =
        `${platform ? platform.label.charAt(0).toUpperCase() + platform.label.slice(1) : "Votre présence sur les réseaux"} vous fait déjà connaître. ` +
        `Un site à votre nom, en complément, vous rendrait aussi visible sur Google et permettrait à vos clients ${deShowcase}.`;
      cost = DIFFERENCE;
      subject = `Un site à votre nom pour ${name}`;
      break;
    case "booking":
      gap =
        `Vos réservations passent déjà par ${platform?.label ?? "une plateforme en ligne"}, c'est pratique. ` +
        `Un site à votre nom, avec votre propre bouton de réservation, vous offrirait en plus une vitrine rien qu'à vous.`;
      cost = "";
      subject = `Un site à votre nom pour ${name}`;
      break;
    case "outdated":
    case "ok": {
      const ideas = plainIssues(data.websiteIssues);
      const domain = websiteDomain(data.websiteUrl) ?? "votre site";
      const visit = question ? `Aujourd'hui, il tombe sur ${domain}, une bonne base.` : `En visitant ${domain},`;
      gap = ideas.length
        ? question
          ? `${visit} J'y vois ${ideas.length > 1 ? "quelques pistes" : "une piste simple"} pour qu'il vous apporte encore plus de clients : ${joinIdeas(ideas)}.`
          : `${visit} j'ai vu ${ideas.length > 1 ? "quelques pistes" : "une piste simple"} pour qu'il vous apporte encore plus de clients : ${joinIdeas(ideas)}.`
        : question
          ? `${visit} J'ai quelques idées pour qu'il vous apporte encore plus de demandes.`
          : `${visit} j'ai eu quelques idées pour qu'il vous apporte encore plus de demandes.`;
      cost = `Ce sont souvent de petits changements qui font une vraie différence sur le nombre de demandes reçues.`;
      subject = `Une idée pour ${domain}`;
      break;
    }
    default:
      if (fromKbo) {
        gap = `C'est le meilleur moment pour avoir un site : vos premiers clients vont vous chercher sur Google, et une présence professionnelle dès le départ fait toute la différence.`;
        cost = "";
        subject = isPerson ? "Félicitations pour votre lancement" : `Félicitations pour ${withArticle(name)}`;
      } else {
        gap = question
          ? `Aujourd'hui, votre fiche Google fait déjà le travail. Un site à votre nom lui permettrait en plus ${deShowcase}.`
          : `Un site à votre nom permettrait à ceux qui vous cherchent ${deShowcase}, en un clic.`;
        cost = DIFFERENCE;
        subject = `Et si ${withArticle(name)} avait son site ?`;
      }
  }

  // 4. Offer, 5. one low-friction call to action
  const offer =
    profile === "outdated" || profile === "ok"
      ? `Je suis développeur web à Bruxelles : je peux moderniser votre site, en gardant votre contenu, pour qu'il soit élégant, adapté au mobile, et bien positionné sur Google. Une fois en ligne, votre site reste entièrement modulable : vous pourrez modifier vos textes, vos photos ou vos horaires en toute autonomie, sans connaissances techniques.`
      : `Je suis développeur web à Bruxelles et je crée des sites sur mesure pour les commerces et indépendants : élégants, adaptés au mobile, et bien positionnés sur Google. Une fois en ligne, votre site reste entièrement modulable : vous pourrez modifier vos textes, vos photos ou vos horaires en toute autonomie, sans connaissances techniques.`;
  // An honest, low-pressure ask: no promise of a ready-made mock-up
  const cta = `Si l'idée vous parle, je serais ravi d'en discuter avec vous lors d'un court appel ou autour d'un café, sans engagement.`;

  const body = [
    "Bonjour,",
    [hook, gap].join(" "),
    cost,
    offer,
    `Pour vous faire une idée, quelques-unes de mes réalisations sont à découvrir ici : ${SENDER.portfolio}`,
    cta,
    `Bien cordialement,\n${signature()}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { subject, body };
}
