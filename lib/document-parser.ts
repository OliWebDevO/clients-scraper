import { createServerSupabaseClient } from "@/lib/supabase";

export async function downloadAndParseDocument(storagePath: string, mimeType: string): Promise<string> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.storage.from("documents").download(storagePath);
  if (error || !data) {
    throw new Error(`Failed to download document: ${error?.message || "No data"}`);
  }

  const buffer = Buffer.from(await data.arrayBuffer());

  if (mimeType === "application/pdf" || storagePath.endsWith(".pdf")) {
    return parsePdf(buffer);
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    storagePath.endsWith(".docx")
  ) {
    return parseDocx(buffer);
  }

  throw new Error(`Unsupported document format: ${mimeType}. Only PDF and DOCX are supported.`);
}

async function parsePdf(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  return result.text.trim();
}

async function parseDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}
