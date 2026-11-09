import { NextRequest, NextResponse } from "next/server";
import { reviewOutreachEmail } from "@/lib/ai-customize";
import { isRateLimited, getClientIdentifier } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const clientIp = getClientIdentifier(request);
  if (isRateLimited("email-review", 20, 60 * 1000, clientIp)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const { subject, text, category } = await request.json();
    if (typeof subject !== "string" || typeof text !== "string" || text.trim().length < 40) {
      return NextResponse.json({ error: "Sujet et message requis" }, { status: 400 });
    }
    const review = await reviewOutreachEmail({
      subject,
      text,
      category: typeof category === "string" ? category : null,
    });
    return NextResponse.json(review);
  } catch (error) {
    console.error("Email review error:", error);
    return NextResponse.json({ error: "Relecture IA indisponible" }, { status: 500 });
  }
}
