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

    // Get business details
    const businessIds = draftsData.map((d: BusinessDraft) => d.business_id);
    const { data: businessesData } = await supabase
      .from("businesses")
      .select("*")
      .in("id", businessIds);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const businessMap = new Map<string, any>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    businessesData?.forEach((b: any) => {
      businessMap.set(b.id, b);
    });

    // Enrich each draft with URLs
    const enrichedDrafts = await Promise.all(
      draftsData.map(async (draft: BusinessDraft) => {
        const business = businessMap.get(draft.business_id);
        let viewUrl: string | null = null;
        let downloadUrl: string | null = null;
        if (draft.storage_path) {
          const { data: viewData } = await supabase.storage
            .from("documents")
            .createSignedUrl(draft.storage_path, 3600);
          viewUrl = viewData?.signedUrl || null;
          const { data: dlData } = await supabase.storage
            .from("documents")
            .createSignedUrl(draft.storage_path, 3600, { download: draft.filename || "proposal.docx" });
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
          business_name: business?.name || "Unknown",
          business_category: business?.category || null,
          business: business || null,
          view_url: viewUrl,
          download_url: downloadUrl,
          final_view_url: finalViewUrl,
          final_download_url: finalDownloadUrl,
        };
      })
    );

    return NextResponse.json({ data: enrichedDrafts });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch business drafts" },
      { status: 500 }
    );
  }
}
