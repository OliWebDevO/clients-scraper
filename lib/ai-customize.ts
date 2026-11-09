import OpenAI from "openai";

// --- OpenAI (actif) ---
const AI_MODEL = "gpt-4o-mini";

// Singleton OpenAI client
let _openaiClient: OpenAI | null = null;
function getOpenAIClient(): OpenAI {
  if (!_openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured. Add it to your .env.local file.");
    }
    _openaiClient = new OpenAI({ apiKey });
  }
  return _openaiClient;
}

// --- Anthropic (alternatif, pour plus tard) ---
// import Anthropic from "@anthropic-ai/sdk";
// const AI_MODEL = "claude-haiku-4-5-20251001";

interface CustomizeInput {
  jobTitle: string;
  company: string | null;
  jobDescription: string;
  cvText: string;
  coverLetterText: string;
}

const systemPrompt = `You are a professional cover letter writer. Your task is to customize a cover letter for a specific job application.

Rules:
- Keep the SAME structure, tone, and language as the original cover letter
- PRESERVE the exact spacing: if the original has 2 or 3 blank lines between sections, keep the SAME number of blank lines in your output
- Each paragraph from the original should remain a separate paragraph in your output
- The number of blank lines between the header, date, salutation, body, and closing MUST match the original exactly
- PRESERVE all formatting markers exactly: **bold text** must stay **bold**, *italic text* must stay *italic*, ***bold+italic*** must stay ***bold+italic***
- If the original letter uses **bold** or *italic* markers, keep them in the same places or equivalent places in your output
- Do NOT add new formatting markers that weren't in the original
- Adapt the content to match the job description and company
- Highlight relevant skills from the CV that match the job requirements
- Do NOT use any other markdown formatting (no headings, no lists, no links)
- Do NOT add any commentary or explanation - output ONLY the customized cover letter
- Preserve the greeting and closing style of the original letter
- Keep approximately the same length as the original
- Preserve the exact same blank line pattern as the original: if the original has multiple consecutive blank lines between sections, reproduce them exactly`;

function buildUserPrompt(input: CustomizeInput): string {
  const jobDesc = input.jobDescription.slice(0, 4000);
  const cvText = input.cvText.slice(0, 3000);

  return `Job Title: ${input.jobTitle}
Company: ${input.company || "Unknown"}

--- JOB DESCRIPTION ---
${jobDesc}

--- MY CV ---
${cvText}

--- ORIGINAL COVER LETTER ---
${input.coverLetterText}

--- TASK ---
Customize this cover letter for the job above. Output only the customized letter, nothing else.`;
}

// --- OpenAI implementation (actif) ---
export async function customizeCoverLetter(input: CustomizeInput): Promise<string> {
  const client = getOpenAIClient();

  const response = await client.chat.completions.create({
    model: AI_MODEL,
    max_tokens: 2000,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: buildUserPrompt(input) },
    ],
  });

  const text = response.choices[0]?.message?.content;
  if (!text) {
    throw new Error("No text response from AI");
  }

  return text.trim();
}

// --- Proposal customization ---

interface CustomizeProposalInput {
  businessName: string;
  businessCategory: string | null;
  businessAddress: string | null;
  websiteUrl: string | null;
  websiteScore: number | null;
  websiteIssues: string[] | null;
  proposalText: string;
}

const proposalSystemPrompt = `You are a professional business proposal writer. Your task is to customize a business proposal for a potential client.

Rules:
- Keep the SAME structure, tone, and language as the original proposal
- PRESERVE the exact spacing: if the original has 2 or 3 blank lines between sections, keep the SAME number of blank lines in your output
- Each paragraph from the original should remain a separate paragraph in your output
- The number of blank lines between sections MUST match the original exactly
- PRESERVE all formatting markers exactly: **bold text** must stay **bold**, *italic text* must stay *italic*, ***bold+italic*** must stay ***bold+italic***
- If the original proposal uses **bold** or *italic* markers, keep them in the same places or equivalent places in your output
- Do NOT add new formatting markers that weren't in the original
- Adapt the content to match the client's business, their website issues, and their industry
- Do NOT use any other markdown formatting (no headings, no lists, no links)
- Do NOT add any commentary or explanation - output ONLY the customized proposal
- Keep approximately the same length as the original
- Preserve the exact same blank line pattern as the original: if the original has multiple consecutive blank lines between sections, reproduce them exactly`;

function sanitizeAiInput(str: string | null | undefined): string {
  if (!str) return "";
  return str.substring(0, 500).replace(/\n/g, " ").replace(/\t/g, " ").trim();
}

function buildProposalUserPrompt(input: CustomizeProposalInput): string {
  const issues = input.websiteIssues?.map(i => sanitizeAiInput(i)).join(", ") || "N/A";

  return `Business Name: ${sanitizeAiInput(input.businessName)}
Category: ${sanitizeAiInput(input.businessCategory) || "Unknown"}
Address: ${sanitizeAiInput(input.businessAddress) || "Unknown"}
Website: ${sanitizeAiInput(input.websiteUrl) || "No website"}
Website Score: ${input.websiteScore !== null ? `${input.websiteScore}/100 (higher = worse)` : "N/A"}
Website Issues: ${issues}

--- ORIGINAL PROPOSAL ---
${input.proposalText}

--- TASK ---
Customize this business proposal for the client above. Reference their specific business, industry, and website issues where relevant. Output only the customized proposal, nothing else.`;
}

export async function customizeProposal(input: CustomizeProposalInput): Promise<string> {
  const client = getOpenAIClient();

  const response = await client.chat.completions.create({
    model: AI_MODEL,
    max_tokens: 2000,
    messages: [
      { role: "system", content: proposalSystemPrompt },
      { role: "user", content: buildProposalUserPrompt(input) },
    ],
  });

  const text = response.choices[0]?.message?.content;
  if (!text) {
    throw new Error("No text response from AI");
  }

  return text.trim();
}

// --- Outreach email proofreading ---

export interface EmailReview {
  verdict: string;
  problems: string[];
  suggestions: string[];
}

const reviewSystemPrompt = `Tu es un relecteur exigeant d'emails de prospection B2B en français de Belgique.
Un développeur web indépendant à Bruxelles écrit à une petite entreprise locale (commerce, restaurant, salon, artisan…) qu'il ne connaît pas.

Vérifie et signale uniquement les vrais problèmes :
- fautes d'orthographe, de grammaire, d'accents, de ponctuation (espaces avant : ; ? ! en français)
- mots en trop ou manquants (ex. « en ouvrant le site, et j'ai remarqué »), articles oubliés devant un nom d'enseigne (« de la Friterie X », « du Salon Y »)
- phrases trop longues ou ambiguës (une phrase = une idée), énumérations qui s'enchaînent mal
- langue : si la commune du destinataire est en Flandre, un email en français est un problème à signaler
- incohérences ou informations qui sonnent faux / génériques / automatisées
- ton : vouvoiement, poli, chaleureux, ni insistant ni trop commercial
- longueur : un premier contact doit faire moins de 150 mots, un seul appel à l'action clair
- adéquation au secteur du destinataire
- éléments qui risquent de déclencher les filtres anti-spam

Réponds UNIQUEMENT en JSON : {"verdict": "Prêt à envoyer" | "À corriger", "problems": [..], "suggestions": [..]}
Chaque élément : une phrase courte en français, en citant le passage concerné. Listes vides si rien à signaler.`;

export async function reviewOutreachEmail(input: { subject: string; text: string; category: string | null; location?: string | null }): Promise<EmailReview> {
  const client = getOpenAIClient();
  const response = await client.chat.completions.create({
    model: AI_MODEL,
    max_tokens: 800,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: reviewSystemPrompt },
      {
        role: "user",
        content: `Secteur du destinataire : ${sanitizeAiInput(input.category) || "inconnu"}\nAdresse du destinataire : ${sanitizeAiInput(input.location) || "inconnue"}\n\nSujet : ${input.subject.slice(0, 300)}\n\n--- EMAIL ---\n${input.text.slice(0, 6000)}`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error("No response from AI");
  const parsed = JSON.parse(raw) as Partial<EmailReview>;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 10) : []);
  return {
    verdict: typeof parsed.verdict === "string" ? parsed.verdict : "À corriger",
    problems: list(parsed.problems),
    suggestions: list(parsed.suggestions),
  };
}

// --- Outreach email auto-correction (phrasing only, then sent without human review) ---

export interface EmailCorrection {
  subject: string;
  body: string;
  changes: string[]; // what was corrected, for the log
  blocking: string | null; // a problem a human must look at (wrong language, doubtful claim…)
}

const correctionSystemPrompt = `Tu es correcteur d'emails de prospection B2B en français de Belgique, écrits par un développeur web indépendant à Bruxelles.

Tu reçois le SUJET et le CORPS d'un email (sans la signature). Corrige UNIQUEMENT :
- l'orthographe, la grammaire, les accents, la ponctuation (espaces avant : ; ? ! en français)
- les mots en trop ou manquants (« en ouvrant le site, et j'ai remarqué » → « en ouvrant le site, j'ai remarqué »)
- les phrases lourdes ou ambiguës : reformule au minimum pour qu'elles se lisent naturellement

Règles strictes :
- ne change AUCUN fait : garde tels quels les chiffres, notes, nombres d'avis, noms d'entreprise, noms de domaine, villes
- n'ajoute JAMAIS d'article devant un nom d'entreprise (« de Haarhuis Happaerts » reste tel quel) : les articles nécessaires sont déjà en place
- n'ajoute ni promesse, ni prix, ni information ; ne supprime aucune phrase ; garde le vouvoiement, le ton et la longueur
- garde les paragraphes (séparés par une ligne vide) dans le même ordre
- si le texte est déjà correct, renvoie-le à l'identique avec "changes": []
- "blocking" : une phrase courte UNIQUEMENT si un humain doit relire (ex. la commune est en Flandre alors que l'email est en français, ou une affirmation semble fausse) ; sinon null

Réponds UNIQUEMENT en JSON : {"subject": "...", "body": "...", "changes": ["correction 1", ...], "blocking": null}`;

export async function correctOutreachEmail(input: {
  subject: string;
  body: string;
  category: string | null;
  location: string | null;
}): Promise<EmailCorrection> {
  const client = getOpenAIClient();
  const response = await client.chat.completions.create({
    model: AI_MODEL,
    max_tokens: 1500,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: correctionSystemPrompt },
      {
        role: "user",
        content:
          `Secteur : ${sanitizeAiInput(input.category) || "inconnu"}\nAdresse : ${sanitizeAiInput(input.location) || "inconnue"}\n\n` +
          `SUJET : ${input.subject.slice(0, 300)}\n\n--- CORPS ---\n${input.body.slice(0, 6000)}`,
      },
    ],
  });
  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error("No response from AI");
  const parsed = JSON.parse(raw) as Partial<EmailCorrection>;
  if (typeof parsed.subject !== "string" || typeof parsed.body !== "string") throw new Error("Malformed AI correction");
  return {
    subject: parsed.subject.trim(),
    body: parsed.body.trim(),
    changes: Array.isArray(parsed.changes) ? parsed.changes.filter((c): c is string => typeof c === "string").slice(0, 10) : [],
    blocking: typeof parsed.blocking === "string" && parsed.blocking.trim() ? parsed.blocking.trim() : null,
  };
}

// --- Anthropic implementation (alternatif, pour plus tard) ---
// export async function customizeCoverLetter(input: CustomizeInput): Promise<string> {
//   const apiKey = process.env.ANTHROPIC_API_KEY;
//   if (!apiKey) {
//     throw new Error("ANTHROPIC_API_KEY is not configured. Add it to your .env.local file.");
//   }
//
//   const client = new Anthropic({ apiKey });
//
//   const response = await client.messages.create({
//     model: AI_MODEL,
//     max_tokens: 2000,
//     system: systemPrompt,
//     messages: [{ role: "user", content: buildUserPrompt(input) }],
//   });
//
//   const textBlock = response.content.find((block) => block.type === "text");
//   if (!textBlock || textBlock.type !== "text") {
//     throw new Error("No text response from AI");
//   }
//
//   return textBlock.text.trim();
// }
