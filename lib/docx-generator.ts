import { Document, Paragraph, TextRun, TabStopType, TabStopPosition, Packer, AlignmentType } from "docx";

interface TextSegment {
  text: string;
  bold: boolean;
  italic: boolean;
}

function parseFormattedText(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  // Match ***bold+italic***, **bold**, *italic*, or plain text
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|([^*]+))/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      segments.push({ text: match[2], bold: true, italic: true });
    } else if (match[3]) {
      segments.push({ text: match[3], bold: true, italic: false });
    } else if (match[4]) {
      segments.push({ text: match[4], bold: false, italic: true });
    } else if (match[5]) {
      segments.push({ text: match[5], bold: false, italic: false });
    }
  }

  if (segments.length === 0) {
    segments.push({ text, bold: false, italic: false });
  }

  return segments;
}

type TextAlignment = "left" | "center" | "right" | "both";

const ALIGNMENT_MAP: Record<TextAlignment, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  both: AlignmentType.JUSTIFIED,
};

interface PageMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface DocxStyle {
  alignment?: TextAlignment;
  fontFamily?: string;
  fontSize?: number; // in pt
  margins?: PageMargins; // in twips
}

// Detect if a block is a "header" line (name, address, date) vs body text.
function isHeaderBlock(block: string): boolean {
  // Strip formatting markers for analysis
  const plain = block.replace(/\*{1,3}/g, "");
  // Contains 5+ consecutive spaces → positioning with spaces
  if (/\s{5,}/.test(plain)) return true;
  // Contains tab characters
  if (plain.includes("\t")) return true;
  // Very short block (< 60 chars per line on average) → likely header/signature
  const lines = plain.split("\n");
  const avgLen = plain.replace(/\n/g, "").length / lines.length;
  if (avgLen < 60 && lines.length <= 3) return true;
  return false;
}

export async function generateDocx(text: string, title?: string, style?: TextAlignment | DocxStyle): Promise<Buffer> {
  const docStyle: DocxStyle = typeof style === "string" ? { alignment: style } : (style || {});
  const bodyAlignment = ALIGNMENT_MAP[docStyle.alignment || "left"];
  const fontFamily = docStyle.fontFamily || "Calibri";
  const fontSizeHalfPt = (docStyle.fontSize || 12) * 2; // pt to half-points
  const margins = docStyle.margins || { top: 1440, bottom: 1440, left: 1440, right: 1440 };
  const paragraphs: Paragraph[] = [];

  // Split on double newlines, preserving empty blocks (blank lines = extra spacing)
  const blocks = text.split(/\n\n/);

  for (const block of blocks) {
    // Empty block → empty paragraph for visual spacing
    if (!block.trim()) {
      paragraphs.push(new Paragraph({ spacing: { after: 100 } }));
      continue;
    }

    const lines = block.split(/\n/);
    const runs: TextRun[] = [];
    const headerBlock = isHeaderBlock(block);

    for (let i = 0; i < lines.length; i++) {
      if (i > 0) {
        runs.push(new TextRun({ break: 1 }));
      }

      const line = lines[i];

      if (headerBlock) {
        // Parse formatting FIRST, then split segments on long space runs → tabs
        const segments = parseFormattedText(line);
        for (const seg of segments) {
          // Split this segment's text on runs of 5+ spaces
          const parts = seg.text.split(/\s{5,}/);
          for (let p = 0; p < parts.length; p++) {
            if (p > 0) {
              runs.push(new TextRun({ text: "\t", font: fontFamily, size: fontSizeHalfPt }));
            }
            if (parts[p]) {
              runs.push(new TextRun({
                text: parts[p],
                font: fontFamily,
                size: fontSizeHalfPt,
                bold: seg.bold || undefined,
                italics: seg.italic || undefined,
              }));
            }
          }
        }
      } else {
        // Body text: parse formatting normally
        const segments = parseFormattedText(line);
        for (const seg of segments) {
          runs.push(new TextRun({
            text: seg.text,
            font: fontFamily,
            size: fontSizeHalfPt,
            bold: seg.bold || undefined,
            italics: seg.italic || undefined,
          }));
        }
      }
    }

    // Check if this header block uses tabs/spaces for positioning
    const plainBlock = block.replace(/\*{1,3}/g, "");
    const useTab = headerBlock && (/\s{5,}/.test(plainBlock) || plainBlock.includes("\t"));

    paragraphs.push(new Paragraph({
      children: runs,
      spacing: { after: 100 },
      alignment: headerBlock ? AlignmentType.LEFT : bodyAlignment,
      ...(useTab ? {
        tabStops: [{
          type: TabStopType.RIGHT,
          position: TabStopPosition.MAX,
        }],
      } : {}),
    }));
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: margins.top,
              bottom: margins.bottom,
              left: margins.left,
              right: margins.right,
            },
          },
        },
        children: paragraphs,
      },
    ],
    ...(title ? { title } : {}),
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
