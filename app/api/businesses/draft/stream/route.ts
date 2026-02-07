import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { downloadAndParseDocument } from "@/lib/document-parser";
import { customizeProposal } from "@/lib/ai-customize";
import { generateDocx } from "@/lib/docx-generator";

export const maxDuration = 120; // 2 minutes max

/**
 * Re-apply the blank line spacing pattern from the original text onto the AI-generated text.
 */
function reapplySpacing(original: string, generated: string): string {
  const originalGaps = original.match(/\n{2,}/g) || [];

  let gapIndex = 0;
  return generated.replace(/\n{2,}/g, () => {
    if (gapIndex < originalGaps.length) {
      return originalGaps[gapIndex++];
    }
    return "\n\n";
  });
}

interface DraftRequest {
  businessId: string;
}

export async function POST(request: NextRequest) {
  const body: DraftRequest = await request.json();
  const { businessId } = body;

  if (!businessId) {
    return new Response(
      JSON.stringify({ error: "No businessId specified" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const supabase = createServerSupabaseClient();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: object) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Phase 1: Init
        sendEvent("progress", {
          progress: 5,
          message: "Chargement du business...",
          phase: "init",
        });

        const { data: business, error: bizError } = await supabase
          .from("businesses")
          .select("*")
          .eq("id", businessId)
          .single();

        if (bizError || !business) {
          throw new Error("Business introuvable");
        }

        sendEvent("progress", {
          progress: 15,
          message: `Business: ${business.name}`,
          phase: "init",
        });

        // Phase 2: Read proposal template
        sendEvent("progress", {
          progress: 25,
          message: "Lecture du template de proposition...",
          phase: "reading_documents",
        });

        const { data: documents, error: docsError } = await supabase
          .from("user_documents")
          .select("*");

        if (docsError) {
          throw new Error("Impossible de charger les documents");
        }

        const proposalDoc = documents?.find((d: { type: string }) => d.type === "proposal_template");

        if (!proposalDoc) {
          throw new Error("Aucun template de proposition uploade. Uploadez-le dans l'onglet Email.");
        }

        sendEvent("progress", {
          progress: 35,
          message: "Extraction du texte de la proposition...",
          phase: "reading_documents",
        });

        const proposalResult = await downloadAndParseDocument(proposalDoc.storage_path, proposalDoc.mime_type);
        const proposalText = proposalResult.text;
        const proposalStyle = {
          alignment: proposalResult.alignment,
          fontFamily: proposalResult.fontFamily,
          fontSize: proposalResult.fontSize,
          margins: proposalResult.margins,
          paragraphSpacing: proposalResult.paragraphSpacing,
        };

        if (!proposalText || proposalText.length < 20) {
          throw new Error("Le template de proposition est vide ou illisible.");
        }

        sendEvent("progress", {
          progress: 50,
          message: "Document lu avec succes",
          phase: "reading_documents",
        });

        // Phase 3: AI Generation
        sendEvent("progress", {
          progress: 60,
          message: "Personnalisation par GPT-4o-mini...",
          phase: "generating",
        });

        const aiOutput = await customizeProposal({
          businessName: business.name,
          businessCategory: business.category,
          businessAddress: business.address,
          websiteUrl: business.website_url,
          websiteScore: business.website_score,
          websiteIssues: business.website_issues,
          proposalText,
        });

        const customizedText = reapplySpacing(proposalText, aiOutput);

        sendEvent("progress", {
          progress: 75,
          message: "Proposition personnalisee generee",
          phase: "generating",
        });

        // Phase 4: Generate DOCX and upload
        sendEvent("progress", {
          progress: 80,
          message: "Generation du fichier DOCX...",
          phase: "saving",
        });

        const nameSlug = business.name.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
        const filename = `Proposition_${nameSlug}.docx`;
        const storagePath = `drafts/business/${businessId}/${filename}`;

        const docxBuffer = await generateDocx(customizedText, `Proposition - ${business.name}`, proposalStyle);

        sendEvent("progress", {
          progress: 85,
          message: "Upload du fichier...",
          phase: "saving",
        });

        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(storagePath, docxBuffer, {
            contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            upsert: true,
          });

        if (uploadError) {
          throw new Error(`Erreur upload: ${uploadError.message}`);
        }

        sendEvent("progress", {
          progress: 90,
          message: "Sauvegarde en base de donnees...",
          phase: "saving",
        });

        await supabase.from("business_drafts").upsert(
          {
            business_id: businessId,
            storage_path: storagePath,
            filename,
            file_size: docxBuffer.length,
            ai_model: "gpt-4o-mini",
            status: "completed",
            error_message: null,
          },
          { onConflict: "business_id" }
        );

        const { data: signedUrlData } = await supabase.storage
          .from("documents")
          .createSignedUrl(storagePath, 3600);

        sendEvent("complete", {
          success: true,
          message: "Proposition commerciale personnalisee generee !",
          downloadUrl: signedUrlData?.signedUrl || null,
          filename,
          fileSize: docxBuffer.length,
        });
      } catch (error) {
        console.error("Business draft stream error:", error);

        try {
          await supabase.from("business_drafts").upsert(
            {
              business_id: businessId,
              status: "failed",
              error_message: error instanceof Error ? error.message : "Erreur inconnue",
            },
            { onConflict: "business_id" }
          );
        } catch {
          // ignore save errors
        }

        sendEvent("error", {
          message: error instanceof Error ? error.message : "Erreur inconnue lors de la generation",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
