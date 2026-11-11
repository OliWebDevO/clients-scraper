/**
 * Pre-send checks for outreach emails. Pure function, used live in the
 * send modal and enforced again by the send API (errors block sending).
 */

export interface EmailCheckResult {
  errors: string[];
  warnings: string[];
}

const SPAM_WORDS = /\b(gratuit|100\s?%|offre exclusive|promo|urgent|dernière chance|cliquez ici|garanti|meilleur prix)\b/i;
const PERSONAL_DOMAINS = /@(gmail|hotmail|outlook|live|yahoo|icloud|me|skynet|telenet|proximus|msn|aol)\./i;

// Words commonly typed without their accent in French outreach copy
const MISSING_ACCENTS = /\b(echange|reputation|visibilite|developpe(?:ment|ur)?|cree|creation|etape|tres|deja|equipe|reserv(?:ation|er)|telephone|interesse|specialise|a (?:notre|votre|bruxelles|la|vos))\b/i;

const STREET_AS_CITY = /(?:^|\s)(?:à|a)\s+\**(?:rue|avenue|av\.|chaussée|chaussee|boulevard|bd|place|square|drève|dreve|clos|allée|allee|quai)\b[^.\n]*\d/i;

export function checkEmail(input: {
  subject: string;
  text: string;
  recipientEmail?: string;
  businessName?: string;
}): EmailCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const subject = input.subject.trim();
  const text = input.text;
  const all = `${subject}\n${text}`;

  // ── Blocking ──
  if (!subject) errors.push("Le sujet est vide.");
  if (text.trim().length < 40) errors.push("Le message est vide ou trop court.");
  const leftover = all.match(/\{\{\s*\w+\s*\}\}/);
  if (leftover) errors.push(`Variable non remplacée : ${leftover[0]}`);
  if (/\b(undefined|null|NaN|\[object Object\])\b/.test(all)) errors.push("Le texte contient « undefined », « null » ou « NaN ».");
  if (input.businessName && !/\p{L}/u.test(input.businessName)) errors.push("Le nom de l'entreprise ne contient aucune lettre (numéro d'entreprise ?).");
  if (STREET_AS_CITY.test(text)) errors.push("Une adresse de rue apparaît à la place de la ville.");

  // ── Warnings ──
  if (/votre ville|votre secteur/i.test(all)) warnings.push("Texte générique (« votre ville » / « votre secteur ») : ville ou catégorie inconnue.");
  if (subject.length > 60) warnings.push(`Sujet long (${subject.length} caractères) : visez moins de 60.`);
  if (/!{2,}|\?{2,}/.test(subject) || /\b[A-ZÀ-Ü]{5,}\b/.test(subject)) warnings.push("Sujet avec majuscules ou ponctuation excessives (filtre anti-spam).");
  if (SPAM_WORDS.test(all)) warnings.push(`Mot « spam » détecté : « ${all.match(SPAM_WORDS)?.[0]} ».`);
  const accent = text.match(MISSING_ACCENTS);
  if (accent) warnings.push(`Accent probablement manquant : « ${accent[0]} ».`);
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words > 220) warnings.push(`Message long (${words} mots) : un premier contact efficace fait moins de 150 mots.`);
  const links = (text.match(/https?:\/\//g) || []).length;
  if (links > 2) warnings.push(`${links} liens : plus de 2 liens nuit à la délivrabilité.`);
  if (input.businessName && /\p{L}/u.test(input.businessName) && input.businessName.length > 4 && input.businessName === input.businessName.toUpperCase() && text.includes(input.businessName)) {
    warnings.push("Le nom de l'entreprise est en MAJUSCULES : écrivez-le normalement.");
  }
  if (input.recipientEmail && PERSONAL_DOMAINS.test(input.recipientEmail)) {
    warnings.push("Adresse personnelle (Gmail, Hotmail…) : c'est une personne physique, le RGPD s'applique — message individuel et désinscription obligatoires.");
  }

  return { errors, warnings };
}

/** Rough HTML → plain text, for the text/plain part and for checks */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h[1-6]|li|tr|div)>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rarr;/g, "→")
    .replace(/&middot;/g, "·")
    .replace(/&([a-z])(acute|grave|circ|uml|cedil);/gi, (_, l: string, k: string) => {
      const map: Record<string, Record<string, string>> = {
        acute: { e: "é", a: "á", E: "É" },
        grave: { e: "è", a: "à", u: "ù", A: "À" },
        circ: { e: "ê", a: "â", o: "ô", i: "î", u: "û" },
        uml: { e: "ë", i: "ï", u: "ü" },
        cedil: { c: "ç", C: "Ç" },
      };
      return map[k.toLowerCase()]?.[l] ?? l;
    })
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const OPT_OUT_TEXT =
  "Vous ne souhaitez plus recevoir de message de ma part ? Répondez simplement « stop » à cet email et je ne vous recontacterai plus.";
