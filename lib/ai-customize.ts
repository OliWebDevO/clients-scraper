import OpenAI from "openai";

// --- OpenAI (actif) ---
const AI_MODEL = "gpt-4o-mini";

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
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured. Add it to your .env.local file.");
  }

  const client = new OpenAI({ apiKey });

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
