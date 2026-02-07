import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import type { BusinessDraft } from "@/lib/types";

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();

    const { data: draftsData, error } = await supabase
      .from("business_drafts")
      .select("*")
      .eq("status", "completed")
      .order("created_at", { ascending: false });

    if (error) throw error;
    if (!draftsData || draftsData.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // Batch fetch business details
    const businessIds = draftsData.map((d: BusinessDraft) => d.business_id);
    const { data: businessesData } = await supabase
      .from("businesses")
      .select("id,name,category")
      .in("id", businessIds);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const businessMap = new Map<string, any>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    businessesData?.forEach((b: any) => {
      businessMap.set(b.id, b);
    });

    // Batch all signed URL requests
    const storagePaths: { path: string; download?: string }[] = [];
    const pathIndexMap: { draftIdx: number; field: string }[] = [];

    draftsData.forEach((draft: BusinessDraft, i: number) => {
      if (draft.storage_path) {
        pathIndexMap.push({ draftIdx: i, field: "view_url" });
        storagePaths.push({ path: draft.storage_path });
        pathIndexMap.push({ draftIdx: i, field: "download_url" });
        storagePaths.push({ path: draft.storage_path, download: draft.filename || "proposal.docx" });
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

    const enrichedDrafts = draftsData.map((draft: BusinessDraft, i: number) => {
      const business = businessMap.get(draft.business_id);
      const urls = draftUrls[i] || {};
      return {
        ...draft,
        business_name: business?.name || "Unknown",
        business_category: business?.category || null,
        business: business || null,
        view_url: urls.view_url || null,
        download_url: urls.download_url || null,
        final_view_url: urls.final_view_url || null,
        final_download_url: urls.final_download_url || null,
      };
    });

    return NextResponse.json({ data: enrichedDrafts });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch business drafts" },
      { status: 500 }
    );
  }
}
