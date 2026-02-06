import Anthropic from "@anthropic-ai/sdk";

const AI_MODEL = "claude-haiku-4-5-20251001";

interface CustomizeInput {
  jobTitle: string;
  company: string | null;
  jobDescription: string;
  cvText: string;
  coverLetterText: string;
}

export async function customizeCoverLetter(input: CustomizeInput): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured. Add it to your .env.local file.");
  }

  const client = new Anthropic({ apiKey });

  const jobDesc = input.jobDescription.slice(0, 4000);
  const cvText = input.cvText.slice(0, 3000);

  const systemPrompt = `You are a professional cover letter writer. Your task is to customize a cover letter for a specific job application.

Rules:
- Keep the SAME structure, tone, and language as the original cover letter
- Adapt the content to match the job description and company
- Highlight relevant skills from the CV that match the job requirements
- Do NOT use markdown formatting - output plain text only
- Do NOT add any commentary or explanation - output ONLY the customized cover letter
- Preserve the greeting and closing style of the original letter
- Keep approximately the same length as the original`;

  const userPrompt = `Job Title: ${input.jobTitle}
Company: ${input.company || "Unknown"}

--- JOB DESCRIPTION ---
${jobDesc}

--- MY CV ---
${cvText}

--- ORIGINAL COVER LETTER ---
${input.coverLetterText}

--- TASK ---
Customize this cover letter for the job above. Output only the customized letter, nothing else.`;

  const response = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from AI");
  }

  return textBlock.text.trim();
}
