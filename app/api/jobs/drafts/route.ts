import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import type { JobDraft } from "@/lib/types";

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();

    const { data: draftsData, error } = await supabase
      .from("job_drafts")
      .select("id, job_id, storage_path, filename, file_size, job_description_text, ai_model, status, error_message, final_storage_path, final_filename, final_file_size, created_at")
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    if (!draftsData || draftsData.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // Get job details
    const jobIds = draftsData.map((d: JobDraft) => d.job_id);
    const { data: jobsData } = await supabase
      .from("jobs")
      .select("id, title, company, source")
      .in("id", jobIds);

    const jobMap = new Map<string, { title: string; company: string | null; source: string | null }>();
    jobsData?.forEach((j: { id: string; title: string; company: string | null; source: string | null }) => {
      jobMap.set(j.id, { title: j.title, company: j.company, source: j.source });
    });

    // Get the user's CV
    const { data: cvDocData } = await supabase
      .from("user_documents")
      .select("filename, storage_path, file_size")
      .eq("type", "cv")
      .single();

    let cvUrl: string | null = null;
    let cvDownloadUrl: string | null = null;
    let cvFilename: string | null = null;
    let cvFileSize: number | null = null;
    if (cvDocData?.storage_path) {
      cvFilename = cvDocData.filename;
      cvFileSize = cvDocData.file_size;
    }

    // Batch all signed URL requests (including CV)
    const storagePaths: { path: string; download?: string }[] = [];
    const pathIndexMap: { draftIdx: number; field: string }[] = [];

    // Add CV signed URLs to the batch (-1 means CV, not a draft)
    if (cvDocData?.storage_path) {
      pathIndexMap.push({ draftIdx: -1, field: "cv_url" });
      storagePaths.push({ path: cvDocData.storage_path });
      pathIndexMap.push({ draftIdx: -1, field: "cv_download_url" });
      storagePaths.push({ path: cvDocData.storage_path, download: cvDocData.filename });
    }

    draftsData.forEach((draft: JobDraft, i: number) => {
      if (draft.storage_path) {
        pathIndexMap.push({ draftIdx: i, field: "view_url" });
        storagePaths.push({ path: draft.storage_path });
        pathIndexMap.push({ draftIdx: i, field: "download_url" });
        storagePaths.push({ path: draft.storage_path, download: draft.filename || "cover_letter.docx" });
      }
      if (draft.final_storage_path) {
        pathIndexMap.push({ draftIdx: i, field: "final_view_url" });
        storagePaths.push({ path: draft.final_storage_path });
        pathIndexMap.push({ draftIdx: i, field: "final_download_url" });
        storagePaths.push({ path: draft.final_storage_path, download: draft.final_filename || "final.docx" });
      }
    });

    const signedUrlResults = await Promise.all(
      storagePaths.map(({ path, download }) =>
        download
          ? supabase.storage.from("documents").createSignedUrl(path, 3600, { download })
          : supabase.storage.from("documents").createSignedUrl(path, 3600)
      )
    );

    // Build URL maps per draft (and CV at index -1)
    const draftUrls: Record<number, Record<string, string | null>> = {};
    signedUrlResults.forEach((result, i) => {
      const { draftIdx, field } = pathIndexMap[i];
      if (!draftUrls[draftIdx]) draftUrls[draftIdx] = {};
      draftUrls[draftIdx][field] = result.data?.signedUrl || null;
    });

    // Extract CV URLs from batch results
    const cvUrls = draftUrls[-1] || {};
    cvUrl = cvUrls.cv_url || null;
    cvDownloadUrl = cvUrls.cv_download_url || null;

    const enrichedDrafts = draftsData.map((draft: JobDraft, i: number) => {
      const job = jobMap.get(draft.job_id);
      const urls = draftUrls[i] || {};
      return {
        ...draft,
        job_title: job?.title || "Unknown",
        job_company: job?.company || "Unknown",
        job_source: job?.source || null,
        view_url: urls.view_url || null,
        download_url: urls.download_url || null,
        cv_url: cvUrl,
        cv_download_url: cvDownloadUrl,
        cv_filename: cvFilename,
        cv_file_size: cvFileSize,
        final_view_url: urls.final_view_url || null,
        final_download_url: urls.final_download_url || null,
      };
    });

    return NextResponse.json({ data: enrichedDrafts });
  } catch (error) {
    console.error("Failed to fetch drafts:", error);
    return NextResponse.json(
      { error: "Failed to fetch drafts" },
      { status: 500 }
    );
  }
}
