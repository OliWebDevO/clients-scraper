import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { isRateLimited, getClientIdentifier } from "@/lib/rate-limit";

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("scrape_schedules")
      .select("id, name, type, enabled, frequency, time_of_day, day_of_week, config, last_run_at, next_run_at, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Get schedules error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch schedules" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const clientIp = getClientIdentifier(request);
  if (isRateLimited("schedules-write", 20, 60 * 1000, clientIp)) {
    return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { name, type, enabled, frequency, time_of_day, day_of_week, config, next_run_at } = body;

    if (!name || !type) {
      return NextResponse.json(
        { success: false, error: "Name and type are required" },
        { status: 400 }
      );
    }

    if (typeof name === "string" && name.length > 200) {
      return NextResponse.json(
        { success: false, error: "Name must be at most 200 characters" },
        { status: 400 }
      );
    }

    if (!["businesses", "jobs"].includes(type)) {
      return NextResponse.json(
        { success: false, error: "Type must be 'businesses' or 'jobs'" },
        { status: 400 }
      );
    }

    if (frequency && !["daily", "every_3_days", "weekly"].includes(frequency)) {
      return NextResponse.json(
        { success: false, error: "Invalid frequency" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("scrape_schedules")
      .insert({
        name,
        type,
        enabled: enabled ?? true,
        frequency: frequency || "daily",
        time_of_day: time_of_day || "09:00",
        day_of_week: day_of_week ?? null,
        config: config || {},
        next_run_at: next_run_at || null,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Create schedule error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create schedule" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const clientIp = getClientIdentifier(request);
  if (isRateLimited("schedules-write", 20, 60 * 1000, clientIp)) {
    return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { id, name, type, enabled, frequency, time_of_day, day_of_week, config, next_run_at } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Schedule ID is required" },
        { status: 400 }
      );
    }

    if (typeof name === "string" && name.length > 200) {
      return NextResponse.json(
        { success: false, error: "Name must be at most 200 characters" },
        { status: 400 }
      );
    }

    if (type && !["businesses", "jobs"].includes(type)) {
      return NextResponse.json(
        { success: false, error: "Type must be 'businesses' or 'jobs'" },
        { status: 400 }
      );
    }

    if (frequency && !["daily", "every_3_days", "weekly"].includes(frequency)) {
      return NextResponse.json(
        { success: false, error: "Invalid frequency" },
        { status: 400 }
      );
    }

    // Build update object with only provided fields
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = name;
    if (type !== undefined) updates.type = type;
    if (enabled !== undefined) updates.enabled = enabled;
    if (frequency !== undefined) updates.frequency = frequency;
    if (time_of_day !== undefined) updates.time_of_day = time_of_day;
    if (day_of_week !== undefined) updates.day_of_week = day_of_week;
    if (config !== undefined) updates.config = config;
    if (next_run_at !== undefined) updates.next_run_at = next_run_at;

    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("scrape_schedules")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Update schedule error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update schedule" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const clientIp = getClientIdentifier(request);
  if (isRateLimited("schedules-write", 20, 60 * 1000, clientIp)) {
    return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Schedule ID is required" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    const { error } = await supabase
      .from("scrape_schedules")
      .delete()
      .eq("id", id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete schedule error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete schedule" },
      { status: 500 }
    );
  }
}
