import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  cv: ["application/pdf"],
  cover_letter: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
    "application/vnd.oasis.opendocument.text", // .odt
  ],
  proposal_template: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
    "application/vnd.oasis.opendocument.text", // .odt
    "text/plain", // .txt
  ],
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^\w.\-() ]/g, "_")  // keep only safe chars
    .replace(/\.{2,}/g, ".")       // no consecutive dots
    .substring(0, 255);            // max length
}

// GET: List all user documents
export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("user_documents")
      .select("*")
      .order("type", { ascending: true });

    if (error) throw error;

    // Generate signed URLs for each document (view + download)
    const docsWithUrls = await Promise.all(
      (data || []).map(async (doc) => {
        const { data: urlData } = await supabase.storage
          .from("documents")
          .createSignedUrl(doc.storage_path, 3600);
        const { data: dlData } = await supabase.storage
          .from("documents")
          .createSignedUrl(doc.storage_path, 3600, { download: doc.filename });

        return {
          ...doc,
          url: urlData?.signedUrl || null,
          download_url: dlData?.signedUrl || null,
        };
      })
    );

    return NextResponse.json({ data: docsWithUrls });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch documents" },
      { status: 500 }
    );
  }
}

// POST: Upload a document
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const type = formData.get("type") as string | null;

    if (!file || !type) {
      return NextResponse.json(
        { error: "File and type are required" },
        { status: 400 }
      );
    }

    if (!["cv", "cover_letter", "proposal_template"].includes(type)) {
      return NextResponse.json(
        { error: "Type must be 'cv', 'cover_letter', or 'proposal_template'" },
        { status: 400 }
      );
    }

    // Validate mime type
    const allowedTypes = ALLOWED_MIME_TYPES[type];
    if (!allowedTypes.includes(file.type)) {
      const extensions = type === "cv" ? "PDF" : type === "proposal_template" ? "PDF, DOCX, ODT, TXT" : "PDF, DOCX, ODT";
      return NextResponse.json(
        { error: `Invalid file type. Accepted: ${extensions}` },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum 10MB" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Delete existing document of same type (replace)
    const { data: existing } = await supabase
      .from("user_documents")
      .select("id, storage_path")
      .eq("type", type)
      .single();

    if (existing) {
      await supabase.storage.from("documents").remove([existing.storage_path]);
      await supabase.from("user_documents").delete().eq("id", existing.id);
    }

    // Upload to Supabase Storage
    const ext = sanitizeFilename(file.name).split(".").pop() || "pdf";
    const storagePath = `${type}/${crypto.randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) throw uploadError;

    // Save metadata to database
    const { data: doc, error: dbError } = await supabase
      .from("user_documents")
      .insert({
        type,
        filename: sanitizeFilename(file.name),
        storage_path: storagePath,
        mime_type: file.type,
        file_size: file.size,
      })
      .select()
      .single();

    if (dbError) throw dbError;

    return NextResponse.json({ data: doc });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload document" },
      { status: 500 }
    );
  }
}

// DELETE: Remove a document
export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "Document ID is required" }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    // Get the document to find storage path
    const { data: doc, error: fetchError } = await supabase
      .from("user_documents")
      .select("storage_path")
      .eq("id", id)
      .single();

    if (fetchError || !doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Delete from storage
    await supabase.storage.from("documents").remove([doc.storage_path]);

    // Delete from database
    const { error: deleteError } = await supabase
      .from("user_documents")
      .delete()
      .eq("id", id);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete document" },
      { status: 500 }
    );
  }
}
