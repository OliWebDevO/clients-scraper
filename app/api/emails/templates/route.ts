import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("email_templates")
      .select("*")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Get templates error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch templates" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, subject, body: templateBody, is_default } = body;

    if (!name || !subject || !templateBody) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // If setting as default, unset other defaults first
    if (is_default) {
      await supabase
        .from("email_templates")
        .update({ is_default: false })
        .eq("is_default", true);
    }

    const { data, error } = await supabase
      .from("email_templates")
      .insert({
        name,
        subject,
        body: templateBody,
        is_default: is_default || false,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Create template error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create template" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, subject, body: templateBody, is_default } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Template ID is required" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // If setting as default, unset other defaults first
    if (is_default) {
      await supabase
        .from("email_templates")
        .update({ is_default: false })
        .eq("is_default", true);
    }

    const { data, error } = await supabase
      .from("email_templates")
      .update({
        name,
        subject,
        body: templateBody,
        is_default: is_default || false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Update template error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update template" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Template ID is required" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    const { error } = await supabase
      .from("email_templates")
      .delete()
      .eq("id", id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete template error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete template" },
      { status: 500 }
    );
  }
}
