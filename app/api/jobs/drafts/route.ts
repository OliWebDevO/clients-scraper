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

    // Batch all signed URL requests
    const storagePaths: { path: string; download?: string }[] = [];
    const pathIndexMap: { draftIdx: number; field: string }[] = [];

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

    // Build URL maps per draft
    const draftUrls: Record<number, Record<string, string | null>> = {};
    signedUrlResults.forEach((result, i) => {
      const { draftIdx, field } = pathIndexMap[i];
      if (!draftUrls[draftIdx]) draftUrls[draftIdx] = {};
      draftUrls[draftIdx][field] = result.data?.signedUrl || null;
    });

    const enrichedDrafts = draftsData.map((draft: JobDraft, i: number) => {
      const job = jobMap.get(draft.job_id);
      const urls = draftUrls[i] || {};
      return {
        ...draft,
        job_title: job?.title || "Unknown",
        job_company: job?.company || "Unknown",
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch drafts" },
      { status: 500 }
    );
  }
}
