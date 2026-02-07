import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { downloadAndParseDocument } from "@/lib/document-parser";

export async function GET(request: NextRequest) {
  try {
    const draftId = request.nextUrl.searchParams.get("draftId");
    if (!draftId) {
      return NextResponse.json({ error: "draftId is required" }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    const { data: draft, error } = await supabase
      .from("business_drafts")
      .select("storage_path, filename")
      .eq("id", draftId)
      .single();

    if (error || !draft?.storage_path) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    const mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const result = await downloadAndParseDocument(draft.storage_path, mimeType);

    return NextResponse.json({ text: result.text });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to extract text" },
      { status: 500 }
    );
  }
}
