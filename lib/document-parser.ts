import { createServerSupabaseClient } from "@/lib/supabase";

export type TextAlignment = "left" | "center" | "right" | "both";

export interface PageMargins {
  top: number;    // twips
  bottom: number; // twips
  left: number;   // twips
  right: number;  // twips
}

export interface ParsedDocument {
  text: string;
  alignment: TextAlignment;
  fontFamily: string;
  fontSize: number; // in pt
  margins?: PageMargins;
  paragraphSpacing?: number; // twips (after-paragraph)
}

export async function downloadAndParseDocument(storagePath: string, mimeType: string): Promise<ParsedDocument> {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.storage.from("documents").download(storagePath);
  if (error || !data) {
    throw new Error(`Failed to download document: ${error?.message || "No data"}`);
  }

  const buffer = Buffer.from(await data.arrayBuffer());

  if (mimeType === "application/pdf" || storagePath.endsWith(".pdf")) {
    return { text: await parsePdf(buffer), alignment: "left", fontFamily: "Calibri", fontSize: 12 };
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    storagePath.endsWith(".docx")
  ) {
    return parseDocx(buffer);
  }

  if (
    mimeType === "application/vnd.oasis.opendocument.text" ||
    storagePath.endsWith(".odt")
  ) {
    return parseOdt(buffer);
  }

  throw new Error(`Unsupported document format: ${mimeType}. Only PDF, DOCX and ODT are supported.`);
}

async function parsePdf(buffer: Buffer): Promise<string> {
  const pdfParse = (await import("pdf-parse")).default;
  const result = await pdfParse(buffer);
  return result.text.trim();
}

async function parseDocx(buffer: Buffer): Promise<ParsedDocument> {
  const mammoth = await import("mammoth");
  const result = await mammoth.convertToHtml({ buffer });

  let text = result.value;

  // Convert HTML bold/italic to markdown-style markers
  text = text.replace(/<strong>([\s\S]*?)<\/strong>/g, "**$1**");
  text = text.replace(/<em>([\s\S]*?)<\/em>/g, "*$1*");

  // Paragraphs → double newlines
  text = text.replace(/<\/p>\s*<p>/g, "\n\n");
  text = text.replace(/<p>/g, "");
  text = text.replace(/<\/p>/g, "");
  text = text.replace(/<br\s*\/?>/g, "\n");

  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode HTML entities
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, " ");

  text = text.replace(/\n{7,}/g, "\n\n\n\n\n\n").trim();

  // Extract style info from DOCX XML (it's a ZIP)
  const alignment = extractDocxAlignment(buffer);
  const { fontFamily, fontSize } = extractDocxFont(buffer);
  const margins = extractDocxMargins(buffer);
  const paragraphSpacing = extractDocxParagraphSpacing(buffer);

  return { text, alignment, fontFamily, fontSize, margins, paragraphSpacing };
}

function extractDocxAlignment(buffer: Buffer): TextAlignment {
  try {
    const AdmZip = require("adm-zip");
    const zip = new AdmZip(buffer);

    // Check default alignment from word/styles.xml
    let defaultAlign: TextAlignment = "left";
    const stylesXml = zip.readAsText("word/styles.xml") || "";

    // Check docDefaults
    const docDefaultsMatch = stylesXml.match(/<w:docDefaults>[\s\S]*?<\/w:docDefaults>/);
    if (docDefaultsMatch) {
      const jcMatch = docDefaultsMatch[0].match(/<w:jc\s+w:val="([^"]+)"/);
      if (jcMatch) {
        const map: Record<string, TextAlignment> = { left: "left", center: "center", right: "right", both: "both" };
        if (map[jcMatch[1]]) defaultAlign = map[jcMatch[1]];
      }
    }

    // Check default paragraph style
    const defaultPStyleMatch = stylesXml.match(/<w:style\s+w:type="paragraph"\s+w:default="1"[^>]*>[\s\S]*?<\/w:style>/);
    if (defaultPStyleMatch) {
      const jcMatch = defaultPStyleMatch[0].match(/<w:jc\s+w:val="([^"]+)"/);
      if (jcMatch) {
        const map: Record<string, TextAlignment> = { left: "left", center: "center", right: "right", both: "both" };
        if (map[jcMatch[1]]) defaultAlign = map[jcMatch[1]];
      }
    }

    // Count explicit alignments in document.xml
    const documentXml = zip.readAsText("word/document.xml") || "";
    const counts: Record<TextAlignment, number> = { left: 0, center: 0, right: 0, both: 0 };
    const jcRegex = /<w:jc\s+w:val="([^"]+)"/g;
    let m;
    while ((m = jcRegex.exec(documentXml)) !== null) {
      const map: Record<string, TextAlignment> = { left: "left", center: "center", right: "right", both: "both" };
      if (map[m[1]]) counts[map[m[1]]]++;
    }

    // Count paragraphs without explicit jc (they inherit default)
    const totalP = (documentXml.match(/<w:p[\s>]/g) || []).length;
    const styledP = Object.values(counts).reduce((a, b) => a + b, 0);
    if (totalP - styledP > 0) {
      counts[defaultAlign] += totalP - styledP;
    }

    let max = 0;
    let dominant: TextAlignment = defaultAlign;
    for (const [key, count] of Object.entries(counts)) {
      if (count > max) {
        max = count;
        dominant = key as TextAlignment;
      }
    }
    return dominant;
  } catch {
    return "left";
  }
}

function extractDocxFont(buffer: Buffer): { fontFamily: string; fontSize: number } {
  try {
    const AdmZip = require("adm-zip");
    const zip = new AdmZip(buffer);
    const stylesXml = zip.readAsText("word/styles.xml") || "";
    const documentXml = zip.readAsText("word/document.xml") || "";

    let fontFamily = "Calibri";
    let fontSize = 12;

    // Check docDefaults for default run properties
    const docDefaultsMatch = stylesXml.match(/<w:docDefaults>[\s\S]*?<\/w:docDefaults>/);
    if (docDefaultsMatch) {
      const fontMatch = docDefaultsMatch[0].match(/<w:rFonts[^>]*w:ascii="([^"]+)"/);
      if (fontMatch) fontFamily = fontMatch[1];
      const sizeMatch = docDefaultsMatch[0].match(/<w:sz\s+w:val="(\d+)"/);
      if (sizeMatch) fontSize = parseInt(sizeMatch[1]) / 2; // half-points to pt
    }

    // Check default paragraph style for run properties
    const defaultPStyleMatch = stylesXml.match(/<w:style\s+w:type="paragraph"\s+w:default="1"[^>]*>[\s\S]*?<\/w:style>/);
    if (defaultPStyleMatch) {
      const fontMatch = defaultPStyleMatch[0].match(/<w:rFonts[^>]*w:ascii="([^"]+)"/);
      if (fontMatch) fontFamily = fontMatch[1];
      const sizeMatch = defaultPStyleMatch[0].match(/<w:sz\s+w:val="(\d+)"/);
      if (sizeMatch) fontSize = parseInt(sizeMatch[1]) / 2;
    }

    // Count most used font/size in document body (explicit run properties)
    const fontCounts: Record<string, number> = {};
    const fontRegex = /<w:rFonts[^>]*w:ascii="([^"]+)"/g;
    let m;
    while ((m = fontRegex.exec(documentXml)) !== null) {
      fontCounts[m[1]] = (fontCounts[m[1]] || 0) + 1;
    }
    let maxFontCount = 0;
    for (const [name, count] of Object.entries(fontCounts)) {
      if (count > maxFontCount) {
        maxFontCount = count;
        fontFamily = name;
      }
    }

    const sizeCounts: Record<number, number> = {};
    const sizeRegex = /<w:sz\s+w:val="(\d+)"/g;
    while ((m = sizeRegex.exec(documentXml)) !== null) {
      const pt = parseInt(m[1]) / 2;
      sizeCounts[pt] = (sizeCounts[pt] || 0) + 1;
    }
    let maxSizeCount = 0;
    for (const [pt, count] of Object.entries(sizeCounts)) {
      if (count > maxSizeCount) {
        maxSizeCount = count;
        fontSize = parseFloat(pt);
      }
    }

    return { fontFamily, fontSize };
  } catch {
    return { fontFamily: "Calibri", fontSize: 12 };
  }
}

function extractDocxMargins(buffer: Buffer): PageMargins | undefined {
  try {
    const AdmZip = require("adm-zip");
    const zip = new AdmZip(buffer);
    const documentXml = zip.readAsText("word/document.xml") || "";

    // Find <w:pgMar> in <w:sectPr>
    const pgMarMatch = documentXml.match(/<w:pgMar([^>]+)\/>/);
    if (!pgMarMatch) return undefined;

    const attrs = pgMarMatch[1];
    const top = attrs.match(/w:top="(\d+)"/);
    const bottom = attrs.match(/w:bottom="(\d+)"/);
    const left = attrs.match(/w:left="(\d+)"/);
    const right = attrs.match(/w:right="(\d+)"/);

    if (top && bottom && left && right) {
      return {
        top: parseInt(top[1]),
        bottom: parseInt(bottom[1]),
        left: parseInt(left[1]),
        right: parseInt(right[1]),
      };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function extractDocxParagraphSpacing(buffer: Buffer): number | undefined {
  try {
    const AdmZip = require("adm-zip");
    const zip = new AdmZip(buffer);
    const stylesXml = zip.readAsText("word/styles.xml") || "";
    const documentXml = zip.readAsText("word/document.xml") || "";

    // Check default paragraph style spacing
    let defaultAfter: number | undefined;
    const defaultPStyleMatch = stylesXml.match(/<w:style\s+w:type="paragraph"\s+w:default="1"[^>]*>[\s\S]*?<\/w:style>/);
    if (defaultPStyleMatch) {
      const spacingMatch = defaultPStyleMatch[0].match(/<w:spacing[^>]*w:after="(\d+)"/);
      if (spacingMatch) defaultAfter = parseInt(spacingMatch[1]);
    }

    // Count most used spacing in document body
    const spacingCounts: Record<number, number> = {};
    const spacingRegex = /<w:spacing[^>]*w:after="(\d+)"/g;
    let m;
    while ((m = spacingRegex.exec(documentXml)) !== null) {
      const val = parseInt(m[1]);
      spacingCounts[val] = (spacingCounts[val] || 0) + 1;
    }

    let maxCount = 0;
    let dominant: number | undefined;
    for (const [val, count] of Object.entries(spacingCounts)) {
      if (count > maxCount) {
        maxCount = count;
        dominant = parseInt(val);
      }
    }

    return dominant ?? defaultAfter;
  } catch {
    return undefined;
  }
}

async function parseOdt(buffer: Buffer): Promise<ParsedDocument> {
  const AdmZip = (await import("adm-zip")).default;
  const zip = new AdmZip(buffer);
  const contentXml = zip.readAsText("content.xml");
  const stylesXml = zip.readAsText("styles.xml") || "";

  if (!contentXml) {
    throw new Error("Invalid ODT file: content.xml not found");
  }

  // Combine both XML sources for style definitions
  const allXml = contentXml + "\n" + stylesXml;

  // Parse ALL style:style blocks (attribute order independent)
  const styleMap: Record<string, { bold: boolean; italic: boolean }> = {};
  const styleBlockRegex = /<style:style\s([^>]*)>([\s\S]*?)<\/style:style>/g;
  let styleMatch;
  while ((styleMatch = styleBlockRegex.exec(allXml)) !== null) {
    const attrs = styleMatch[1];
    const body = styleMatch[2];

    const nameMatch = attrs.match(/style:name="([^"]+)"/);
    if (!nameMatch) continue;
    const styleName = nameMatch[1];

    // Check for bold/italic in both opening tag attributes and child text-properties
    const fullBlock = attrs + body;
    const bold = /fo:font-weight="bold"/.test(fullBlock);
    const italic = /fo:font-style="italic"/.test(fullBlock);

    if (bold || italic) {
      styleMap[styleName] = { bold, italic };
    }
  }

  // Also handle self-closing style:style elements
  const selfClosingRegex = /<style:style\s([^/]*?)\/>/g;
  while ((styleMatch = selfClosingRegex.exec(allXml)) !== null) {
    const attrs = styleMatch[1];
    const nameMatch = attrs.match(/style:name="([^"]+)"/);
    if (!nameMatch) continue;
    const bold = /fo:font-weight="bold"/.test(attrs);
    const italic = /fo:font-style="italic"/.test(attrs);
    if (bold || italic) {
      styleMap[nameMatch[1]] = { bold, italic };
    }
  }

  let processed = contentXml;

  // Replace text:span elements with formatting markers (loop for nested spans)
  let prev = "";
  while (prev !== processed) {
    prev = processed;
    processed = processed.replace(
      /<text:span\s+text:style-name="([^"]+)">([\s\S]*?)<\/text:span>/g,
      (_, styleName, content) => {
        const style = styleMap[styleName];
        if (!style) return content;
        if (style.bold && style.italic) return `***${content}***`;
        if (style.bold) return `**${content}**`;
        if (style.italic) return `*${content}*`;
        return content;
      }
    );
  }

  // Handle paragraph-level bold/italic: wrap entire paragraph content
  processed = processed.replace(
    /<text:p\s+text:style-name="([^"]+)">([\s\S]*?)<\/text:p>/g,
    (fullMatch, styleName, content) => {
      const style = styleMap[styleName];
      if (!style) return fullMatch;
      if (content.startsWith("**") || content.startsWith("*")) return fullMatch;
      if (style.bold && style.italic) return `<text:p text:style-name="${styleName}">***${content}***</text:p>`;
      if (style.bold) return `<text:p text:style-name="${styleName}">**${content}**</text:p>`;
      if (style.italic) return `<text:p text:style-name="${styleName}">*${content}*</text:p>`;
      return fullMatch;
    }
  );

  // Remove empty/self-closing spans
  processed = processed.replace(/<text:span[^>]*\/>/g, "");

  // Extract text with paragraph handling
  const text = processed
    .replace(/<text:p[^>]*>/g, "\n\n")
    .replace(/<text:line-break\/>/g, "\n")
    .replace(/<text:tab\/>/g, "\t")
    .replace(/<text:s text:c="(\d+)"\/>/g, (_, n: string) => " ".repeat(parseInt(n)))
    .replace(/<text:s\/>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{7,}/g, "\n\n\n\n\n\n")
    .trim();

  // Detect alignment by resolving style inheritance
  const alignment = detectOdtAlignment(contentXml, allXml);
  const { fontFamily, fontSize } = detectOdtFont(allXml);
  const margins = extractOdtMargins(allXml);
  const paragraphSpacing = extractOdtParagraphSpacing(allXml);

  return { text, alignment, fontFamily, fontSize, margins, paragraphSpacing };
}

function detectOdtFont(allXml: string): { fontFamily: string; fontSize: number } {
  let fontFamily = "Calibri";
  let fontSize = 12;

  // 1. Check default text style
  const defaultTextStyle = allXml.match(/<style:default-style[^>]*style:family="paragraph"[\s\S]*?<\/style:default-style>/);
  if (defaultTextStyle) {
    const fontMatch = defaultTextStyle[0].match(/style:font-name="([^"]+)"/);
    if (fontMatch) fontFamily = fontMatch[1];
    const sizeMatch = defaultTextStyle[0].match(/fo:font-size="([0-9.]+)pt"/);
    if (sizeMatch) fontSize = parseFloat(sizeMatch[1]);
  }

  // 2. Check "Standard" paragraph style (overrides default)
  const standardStyle = allXml.match(/<style:style[^>]*style:name="Standard"[^>]*>[\s\S]*?<\/style:style>/);
  if (standardStyle) {
    const fontMatch = standardStyle[0].match(/style:font-name="([^"]+)"/);
    if (fontMatch) fontFamily = fontMatch[1];
    const sizeMatch = standardStyle[0].match(/fo:font-size="([0-9.]+)pt"/);
    if (sizeMatch) fontSize = parseFloat(sizeMatch[1]);
  }

  // 3. Resolve font-name via font-face declarations (style:font-name → svg:font-family)
  const fontFaceMap: Record<string, string> = {};
  const fontFaceRegex = /<style:font-face\s[^>]*style:name="([^"]+)"[^>]*svg:font-family="([^"]+)"/g;
  let ffm;
  while ((ffm = fontFaceRegex.exec(allXml)) !== null) {
    fontFaceMap[ffm[1]] = ffm[2];
  }
  if (fontFaceMap[fontFamily]) {
    fontFamily = fontFaceMap[fontFamily];
  }

  // 4. Count most used font/size in text-properties across all styles
  const fontCounts: Record<string, number> = {};
  const fontRegex = /style:font-name="([^"]+)"/g;
  let m;
  while ((m = fontRegex.exec(allXml)) !== null) {
    const resolved = fontFaceMap[m[1]] || m[1];
    fontCounts[resolved] = (fontCounts[resolved] || 0) + 1;
  }
  let maxFontCount = 0;
  for (const [name, count] of Object.entries(fontCounts)) {
    if (count > maxFontCount) {
      maxFontCount = count;
      fontFamily = name;
    }
  }

  const sizeCounts: Record<number, number> = {};
  const sizeRegex = /fo:font-size="([0-9.]+)pt"/g;
  while ((m = sizeRegex.exec(allXml)) !== null) {
    const pt = parseFloat(m[1]);
    sizeCounts[pt] = (sizeCounts[pt] || 0) + 1;
  }
  let maxSizeCount = 0;
  for (const [pt, count] of Object.entries(sizeCounts)) {
    if (count > maxSizeCount) {
      maxSizeCount = count;
      fontSize = parseFloat(pt);
    }
  }

  return { fontFamily, fontSize };
}

const ODT_ALIGN_MAP: Record<string, TextAlignment> = {
  start: "left", left: "left", center: "center", end: "right", right: "right", justify: "both",
};

function detectOdtAlignment(contentXml: string, allXml: string): TextAlignment {
  // 1. Find default paragraph alignment (style:default-style)
  let defaultAlign: TextAlignment = "left";
  const defaultStyleRegex = /<style:default-style[^>]*style:family="paragraph"[\s\S]*?<\/style:default-style>/g;
  const defaultMatch = defaultStyleRegex.exec(allXml);
  if (defaultMatch) {
    const alignMatch = defaultMatch[0].match(/fo:text-align="([^"]+)"/);
    if (alignMatch && ODT_ALIGN_MAP[alignMatch[1]]) {
      defaultAlign = ODT_ALIGN_MAP[alignMatch[1]];
    }
  }

  // 2. Build paragraph style → alignment map (explicit only)
  const styleAlignMap: Record<string, TextAlignment | null> = {};
  const styleParentMap: Record<string, string | null> = {};

  const styleBlockRegex2 = /<style:style\s([^>]*)>([\s\S]*?)<\/style:style>/g;
  let sm;
  while ((sm = styleBlockRegex2.exec(allXml)) !== null) {
    const attrs = sm[1];
    const body = sm[2];
    const nameMatch = attrs.match(/style:name="([^"]+)"/);
    const familyMatch = attrs.match(/style:family="([^"]+)"/);
    if (!nameMatch || (familyMatch && familyMatch[1] !== "paragraph")) continue;

    const styleName = nameMatch[1];
    const parentMatch = attrs.match(/style:parent-style-name="([^"]+)"/);
    styleParentMap[styleName] = parentMatch ? parentMatch[1] : null;

    const alignMatch = (attrs + body).match(/fo:text-align="([^"]+)"/);
    styleAlignMap[styleName] = alignMatch && ODT_ALIGN_MAP[alignMatch[1]]
      ? ODT_ALIGN_MAP[alignMatch[1]]
      : null;
  }

  // 3. Resolve inherited alignment for a style
  function resolveAlignment(styleName: string, visited = new Set<string>()): TextAlignment {
    if (visited.has(styleName)) return defaultAlign;
    visited.add(styleName);

    const explicit = styleAlignMap[styleName];
    if (explicit) return explicit;

    const parent = styleParentMap[styleName];
    if (parent) return resolveAlignment(parent, visited);

    return defaultAlign;
  }

  // 4. Count actual <text:p> usage
  const counts: Record<TextAlignment, number> = { left: 0, center: 0, right: 0, both: 0 };
  const pRegex = /<text:p\s+text:style-name="([^"]+)"/g;
  let pm;
  while ((pm = pRegex.exec(contentXml)) !== null) {
    const align = resolveAlignment(pm[1]);
    counts[align]++;
  }

  // Also count <text:p> without explicit style (inherits default)
  const allPCount = (contentXml.match(/<text:p[\s>]/g) || []).length;
  const styledPCount = Object.values(counts).reduce((a, b) => a + b, 0);
  const unstyledPCount = allPCount - styledPCount;
  if (unstyledPCount > 0) {
    counts[defaultAlign] += unstyledPCount;
  }

  // 5. Return dominant alignment
  let max = 0;
  let dominant: TextAlignment = defaultAlign;
  for (const [key, count] of Object.entries(counts)) {
    if (count > max) {
      max = count;
      dominant = key as TextAlignment;
    }
  }
  return dominant;
}

function cmToTwips(cm: number): number {
  return Math.round(cm * 566.93);
}

function extractOdtMargins(allXml: string): PageMargins | undefined {
  // Look for <style:page-layout-properties> with fo:margin-* attributes
  const plpMatch = allXml.match(/<style:page-layout-properties([^>]*(?:>[\s\S]*?<\/style:page-layout-properties>|\/>))/);
  if (!plpMatch) return undefined;

  const block = plpMatch[1];
  const topMatch = block.match(/fo:margin-top="([0-9.]+)cm"/);
  const bottomMatch = block.match(/fo:margin-bottom="([0-9.]+)cm"/);
  const leftMatch = block.match(/fo:margin-left="([0-9.]+)cm"/);
  const rightMatch = block.match(/fo:margin-right="([0-9.]+)cm"/);

  if (topMatch && bottomMatch && leftMatch && rightMatch) {
    return {
      top: cmToTwips(parseFloat(topMatch[1])),
      bottom: cmToTwips(parseFloat(bottomMatch[1])),
      left: cmToTwips(parseFloat(leftMatch[1])),
      right: cmToTwips(parseFloat(rightMatch[1])),
    };
  }
  return undefined;
}

function extractOdtParagraphSpacing(allXml: string): number | undefined {
  // Look for dominant fo:margin-bottom on paragraph properties
  const spacingCounts: Record<number, number> = {};
  const spacingRegex = /<style:paragraph-properties[^>]*fo:margin-bottom="([0-9.]+)cm"/g;
  let m;
  while ((m = spacingRegex.exec(allXml)) !== null) {
    const twips = cmToTwips(parseFloat(m[1]));
    spacingCounts[twips] = (spacingCounts[twips] || 0) + 1;
  }

  let maxCount = 0;
  let dominant: number | undefined;
  for (const [val, count] of Object.entries(spacingCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominant = parseInt(val);
    }
  }
  return dominant;
}
