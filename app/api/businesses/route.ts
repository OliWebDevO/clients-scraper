import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { isRateLimited, getClientIdentifier } from "@/lib/rate-limit";

export async function PATCH(request: NextRequest) {
  const clientIp = getClientIdentifier(request);
  if (isRateLimited("businesses-write", 30, 60 * 1000, clientIp)) {
    return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { id, investigated, viable } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json(
        { success: false, error: "Business ID is required" },
        { status: 400 }
      );
    }

    const updates: Record<string, boolean | null> = {};

    if (typeof investigated === "boolean") {
      updates.investigated = investigated;
    }
    if (viable === null || typeof viable === "boolean") {
      updates.viable = viable;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("businesses")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Update business error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update business" },
      { status: 500 }
    );
  }
}
