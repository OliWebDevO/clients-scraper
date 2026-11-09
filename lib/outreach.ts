/**
 * Shared pieces of outreach sending (send API + automatic follow-ups).
 */
import { OPT_OUT_TEXT } from "./email-checks";
import { cleanBusinessName, getCity, signature } from "./prospect";

export interface FollowUpSettings {
  enabled: boolean;
  delay_days: number;
}

export const DEFAULT_FOLLOWUP_SETTINGS: FollowUpSettings = { enabled: false, delay_days: 5 };

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Plain-text outreach email → simple HTML, with the opt-out line */
export function plainEmailToHtml(body: string): string {
  const htmlBody = escapeHtml(`${body}\n\n—\n${OPT_OUT_TEXT}`)
    .replace(/\n/g, "<br>")
    .replace(/  /g, "&nbsp;&nbsp;");
  return `<div style="font-family: Arial, sans-serif; line-height: 1.6;">${htmlBody}</div>`;
}

/** Mon–Fri, 9:00–17:00 in Brussels: follow-ups land when a shop owner reads their mail */
export function isBrusselsWorkingHour(date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Brussels",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(date);
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  return !["Sat", "Sun"].includes(weekday ?? "") && hour >= 9 && hour < 17;
}

/** One short, polite follow-up, sent as a reply to the first email (same subject → same thread) */
export function generateFollowUpEmail(input: {
  businessName: string;
  address: string | null;
  source: string | null;
  originalSubject: string;
  originalBody: string | null; // null when the first email was the designed HTML template
  originalSentAt: string;
}): { subject: string; body: string } {
  const city = getCity(input.address);
  const name = input.source === "kbo_person" ? "votre activité" : cleanBusinessName(input.businessName, city);
  const sentOn = new Date(input.originalSentAt).toLocaleDateString("fr-BE", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/Brussels",
  });

  const parts = [
    "Bonjour,",
    `Je me permets de revenir vers vous au sujet de mon message du ${sentOn}, à propos d'un site pour ${name}.`,
    `Je sais que vos journées sont bien remplies : si le sujet vous intéresse, 10 minutes au téléphone suffisent pour voir ensemble ce qui vous serait vraiment utile. Sinon, un simple « non merci » me suffit et je ne vous relancerai plus.`,
    `Bien cordialement,\n${signature()}`,
  ];
  if (input.originalBody) {
    const quoted = input.originalBody
      .trim()
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    parts.push(`----- Message du ${sentOn} -----\n${quoted}`);
  }

  const subject = /^re\s*:/i.test(input.originalSubject) ? input.originalSubject : `Re: ${input.originalSubject}`;
  return { subject, body: parts.join("\n\n") };
}
