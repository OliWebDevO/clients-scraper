import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.oasis.opendocument.text", // .odt
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// POST: Upload final version of a draft
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const draftId = formData.get("draftId") as string | null;

    if (!file || !draftId) {
      return NextResponse.json(
        { error: "File and draftId are required" },
        { status: 400 }
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Accepted: PDF, DOCX, ODT" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum 10MB" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Verify draft exists
    const { data: draft, error: fetchError } = await supabase
      .from("job_drafts")
      .select("id, final_storage_path")
      .eq("id", draftId)
      .single();

    if (fetchError || !draft) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    // Delete previous final version if exists
    if (draft.final_storage_path) {
      await supabase.storage.from("documents").remove([draft.final_storage_path]);
    }

    // Upload to Supabase Storage
    const ext = file.name.split(".").pop() || "docx";
    const storagePath = `drafts/final/${draftId}/${crypto.randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // Update draft record
    const { data: updated, error: updateError } = await supabase
      .from("job_drafts")
      .update({
        final_storage_path: storagePath,
        final_filename: file.name,
        final_file_size: file.size,
      })
      .eq("id", draftId)
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ data: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload final version" },
      { status: 500 }
    );
  }
}

// DELETE: Remove final version
export async function DELETE(request: NextRequest) {
  try {
    const { draftId } = await request.json();

    if (!draftId) {
      return NextResponse.json({ error: "draftId is required" }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    const { data: draft, error: fetchError } = await supabase
      .from("job_drafts")
      .select("final_storage_path")
      .eq("id", draftId)
      .single();

    if (fetchError || !draft) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    if (draft.final_storage_path) {
      await supabase.storage.from("documents").remove([draft.final_storage_path]);
    }

    const { error: updateError } = await supabase
      .from("job_drafts")
      .update({
        final_storage_path: null,
        final_filename: null,
        final_file_size: null,
      })
      .eq("id", draftId);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete final version" },
      { status: 500 }
    );
  }
}
