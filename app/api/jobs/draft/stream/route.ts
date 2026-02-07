import { NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { scrapeJobDescription } from "@/lib/job-description-scraper";
import { downloadAndParseDocument } from "@/lib/document-parser";
import { customizeCoverLetter } from "@/lib/ai-customize";
import { generateDocx } from "@/lib/docx-generator";
import { isRateLimited, getClientIdentifier } from "@/lib/rate-limit";
import { reapplySpacing } from "@/lib/utils";

export const maxDuration = 120; // 2 minutes max

interface DraftRequest {
  jobId: string;
}

export async function POST(request: NextRequest) {
  const clientIp = getClientIdentifier(request);
  if (isRateLimited("draft-job", 10, 60 * 1000, clientIp)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 });
  }

  const body: DraftRequest = await request.json();
  const { jobId } = body;

  if (!jobId) {
    return new Response(
      JSON.stringify({ error: "No jobId specified" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(jobId)) {
    return new Response(
      JSON.stringify({ error: "Invalid ID format" }),
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
          message: "Chargement du job...",
          phase: "init",
        });

        const { data: job, error: jobError } = await supabase
          .from("jobs")
          .select("id, title, company, description, url")
          .eq("id", jobId)
          .single();

        if (jobError || !job) {
          throw new Error("Job introuvable");
        }

        // Phase 2: Fetch job description
        sendEvent("progress", {
          progress: 15,
          message: "Récupération de la description du job...",
          phase: "fetching_job",
        });

        let jobDescription = job.description || "";

        // If description is short or missing, try to scrape from URL
        if (jobDescription.length < 100 && job.url) {
          try {
            sendEvent("progress", {
              progress: 20,
              message: "Scraping de la description depuis le site...",
              phase: "fetching_job",
            });
            jobDescription = await scrapeJobDescription(job.url);
          } catch (e) {
            console.warn("Failed to scrape job description:", e);
            // Use whatever we have
          }
        }

        if (jobDescription.length < 20) {
          throw new Error("Description du job trop courte ou introuvable. Impossible de générer un draft.");
        }

        sendEvent("progress", {
          progress: 30,
          message: `Description récupérée (${jobDescription.length} caractères)`,
          phase: "fetching_job",
        });

        // Phase 3: Read documents
        sendEvent("progress", {
          progress: 35,
          message: "Lecture des documents (CV + lettre)...",
          phase: "reading_documents",
        });

        // Get user documents
        const { data: documents, error: docsError } = await supabase
          .from("user_documents")
          .select("id, type, storage_path, mime_type")
          .in("type", ["cv", "cover_letter"]);

        if (docsError) {
          throw new Error("Impossible de charger les documents");
        }

        const cvDoc = documents?.find((d: { type: string }) => d.type === "cv");
        const coverLetterDoc = documents?.find((d: { type: string }) => d.type === "cover_letter");

        if (!cvDoc) {
          throw new Error("Aucun CV uploadé. Uploadez votre CV dans l'onglet Email.");
        }
        if (!coverLetterDoc) {
          throw new Error("Aucune lettre de motivation uploadée. Uploadez-la dans l'onglet Email.");
        }

        sendEvent("progress", {
          progress: 40,
          message: "Extraction des documents (CV + lettre)...",
          phase: "reading_documents",
        });

        const [cvResult, coverLetterResult] = await Promise.all([
          downloadAndParseDocument(cvDoc.storage_path, cvDoc.mime_type),
          downloadAndParseDocument(coverLetterDoc.storage_path, coverLetterDoc.mime_type),
        ]);

        const cvText = cvResult.text;
        const coverLetterText = coverLetterResult.text;
        const coverLetterStyle = {
          alignment: coverLetterResult.alignment,
          fontFamily: coverLetterResult.fontFamily,
          fontSize: coverLetterResult.fontSize,
          margins: coverLetterResult.margins,
          paragraphSpacing: coverLetterResult.paragraphSpacing,
        };

        if (!cvText || cvText.length < 20) {
          throw new Error("Le CV est vide ou illisible.");
        }
        if (!coverLetterText || coverLetterText.length < 20) {
          throw new Error("La lettre de motivation est vide ou illisible.");
        }

        sendEvent("progress", {
          progress: 50,
          message: "Documents lus avec succès",
          phase: "reading_documents",
        });

        // Phase 4: AI Generation
        sendEvent("progress", {
          progress: 60,
          message: "Personnalisation par GPT-4o-mini...",
          phase: "generating",
        });

        const aiOutput = await customizeCoverLetter({
          jobTitle: job.title,
          company: job.company,
          jobDescription,
          cvText,
          coverLetterText,
        });

        // Re-apply the original spacing pattern (AI often collapses blank lines)
        const customizedText = reapplySpacing(coverLetterText, aiOutput);

        sendEvent("progress", {
          progress: 75,
          message: "Lettre personnalisée générée",
          phase: "generating",
        });

        // Phase 5: Generate DOCX and upload
        sendEvent("progress", {
          progress: 80,
          message: "Génération du fichier DOCX...",
          phase: "saving",
        });

        const companySlug = (job.company || "unknown").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
        const filename = `Lettre_${companySlug}.docx`;
        const storagePath = `drafts/${jobId}/${filename}`;

        const docxBuffer = await generateDocx(customizedText, `Cover Letter - ${job.company || job.title}`, coverLetterStyle);

        sendEvent("progress", {
          progress: 85,
          message: "Upload du fichier...",
          phase: "saving",
        });

        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(storagePath, docxBuffer, {
            contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            upsert: true,
          });

        if (uploadError) {
          throw new Error(`Erreur upload: ${uploadError.message}`);
        }

        // Save draft record
        sendEvent("progress", {
          progress: 90,
          message: "Sauvegarde en base de données...",
          phase: "saving",
        });

        await supabase.from("job_drafts").upsert(
          {
            job_id: jobId,
            storage_path: storagePath,
            filename,
            file_size: docxBuffer.length,
            job_description_text: jobDescription.slice(0, 5000),
            ai_model: "gpt-4o-mini",
            status: "completed",
            error_message: null,
          },
          { onConflict: "job_id" }
        );

        // Get signed URL for download
        const { data: signedUrlData } = await supabase.storage
          .from("documents")
          .createSignedUrl(storagePath, 3600); // 1 hour

        sendEvent("complete", {
          success: true,
          message: "Lettre de motivation personnalisée générée !",
          downloadUrl: signedUrlData?.signedUrl || null,
          filename,
          fileSize: docxBuffer.length,
        });
      } catch (error) {
        console.error("Draft stream error:", error);

        // Save failed status
        try {
          await supabase.from("job_drafts").upsert(
            {
              job_id: jobId,
              status: "failed",
              error_message: error instanceof Error ? error.message : "Erreur inconnue",
            },
            { onConflict: "job_id" }
          );
        } catch {
          // ignore save errors
        }

        sendEvent("error", {
          message: error instanceof Error ? error.message : "Erreur inconnue lors de la génération",
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
