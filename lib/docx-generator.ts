import { Document, Paragraph, TextRun, Packer, AlignmentType } from "docx";

export async function generateDocx(text: string, title?: string): Promise<Buffer> {
  const paragraphs: Paragraph[] = [];

  // Split text into paragraphs
  const blocks = text.split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.split(/\n/);
    const runs: TextRun[] = [];

    for (let i = 0; i < lines.length; i++) {
      if (i > 0) {
        runs.push(new TextRun({ break: 1 }));
      }
      runs.push(
        new TextRun({
          text: lines[i],
          font: "Calibri",
          size: 24, // 12pt in half-points
        })
      );
    }

    paragraphs.push(
      new Paragraph({
        children: runs,
        spacing: { after: 200 },
        alignment: AlignmentType.LEFT,
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch in twips
              bottom: 1440,
              left: 1440,
              right: 1440,
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
