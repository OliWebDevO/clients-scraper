import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import type { JobDraft } from "@/lib/types";

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();

    const { data: draftsData, error } = await supabase
      .from("job_drafts")
      .select("*")
      .eq("status", "completed")
      .order("created_at", { ascending: false });

    if (error) throw error;
    if (!draftsData || draftsData.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // Get job details
    const jobIds = draftsData.map((d: JobDraft) => d.job_id);
    const { data: jobsData } = await supabase
      .from("jobs")
      .select("id, title, company")
      .in("id", jobIds);

    const jobMap = new Map<string, { title: string; company: string | null }>();
    jobsData?.forEach((j: { id: string; title: string; company: string | null }) => {
      jobMap.set(j.id, { title: j.title, company: j.company });
    });

    // Get the user's CV
    const { data: cvDocData } = await supabase
      .from("user_documents")
      .select("*")
      .eq("type", "cv")
      .single();

    let cvUrl: string | null = null;
    let cvDownloadUrl: string | null = null;
    let cvFilename: string | null = null;
    let cvFileSize: number | null = null;
    if (cvDocData?.storage_path) {
      const { data: cvViewData } = await supabase.storage
        .from("documents")
        .createSignedUrl(cvDocData.storage_path, 3600);
      cvUrl = cvViewData?.signedUrl || null;
      const { data: cvDlData } = await supabase.storage
        .from("documents")
        .createSignedUrl(cvDocData.storage_path, 3600, { download: cvDocData.filename });
      cvDownloadUrl = cvDlData?.signedUrl || null;
      cvFilename = cvDocData.filename;
      cvFileSize = cvDocData.file_size;
    }

    // Enrich each draft with URLs
    const enrichedDrafts = await Promise.all(
      draftsData.map(async (draft: JobDraft) => {
        const job = jobMap.get(draft.job_id);
        let viewUrl: string | null = null;
        let downloadUrl: string | null = null;
        if (draft.storage_path) {
          const { data: viewData } = await supabase.storage
            .from("documents")
            .createSignedUrl(draft.storage_path, 3600);
          viewUrl = viewData?.signedUrl || null;
          const { data: dlData } = await supabase.storage
            .from("documents")
            .createSignedUrl(draft.storage_path, 3600, { download: draft.filename || "cover_letter.docx" });
          downloadUrl = dlData?.signedUrl || null;
        }
        // Final version URLs
        let finalViewUrl: string | null = null;
        let finalDownloadUrl: string | null = null;
        if (draft.final_storage_path) {
          const { data: fViewData } = await supabase.storage
            .from("documents")
            .createSignedUrl(draft.final_storage_path, 3600);
          finalViewUrl = fViewData?.signedUrl || null;
          const { data: fDlData } = await supabase.storage
            .from("documents")
            .createSignedUrl(draft.final_storage_path, 3600, { download: draft.final_filename || "final.docx" });
          finalDownloadUrl = fDlData?.signedUrl || null;
        }

        return {
          ...draft,
          job_title: job?.title || "Unknown",
          job_company: job?.company || "Unknown",
          view_url: viewUrl,
          download_url: downloadUrl,
          cv_url: cvUrl,
          cv_download_url: cvDownloadUrl,
          cv_filename: cvFilename,
          cv_file_size: cvFileSize,
          final_view_url: finalViewUrl,
          final_download_url: finalDownloadUrl,
        };
      })
    );

    return NextResponse.json({ data: enrichedDrafts });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch drafts" },
      { status: 500 }
    );
  }
}
