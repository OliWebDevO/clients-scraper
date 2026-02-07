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
