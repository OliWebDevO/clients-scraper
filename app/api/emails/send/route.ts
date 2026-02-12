import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/resend";
import { isRateLimited, getClientIdentifier } from "@/lib/rate-limit";
import { buildHtmlEmail, HTML_TEMPLATE_MARKER, type HtmlEmailOverrides } from "@/lib/email-html-template";

interface SendEmailRequest {
  recipientEmail: string;
  subject: string;
  body: string;
  businessId?: string;
  templateId?: string;
  useHtmlTemplate?: boolean;
  htmlOverrides?: HtmlEmailOverrides;
}

export async function POST(request: NextRequest) {
  const clientIp = getClientIdentifier(request);
  if (isRateLimited("email-send", 20, 60 * 1000, clientIp)) {
    return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
  }

  try {
    const body: SendEmailRequest = await request.json();
    const { recipientEmail, subject, body: emailBody, businessId, templateId, useHtmlTemplate, htmlOverrides } = body;

    if (!recipientEmail || !subject) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Input length validation
    if (subject.length > 500) {
      return NextResponse.json(
        { success: false, error: "Subject must be at most 500 characters" },
        { status: 400 }
      );
    }

    // Validate email format, max length, and minimum TLD length
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (
      recipientEmail.length > 254 ||
      !emailRegex.test(recipientEmail) ||
      !/\.[a-zA-Z]{2,}$/.test(recipientEmail)
    ) {
      return NextResponse.json(
        { success: false, error: "Invalid email address" },
        { status: 400 }
      );
    }

    let html: string;
    let logBody: string;

    if (useHtmlTemplate && businessId) {
      // Build the designed HTML email from business data
      const supabase = createServerSupabaseClient();
      const { data: business } = await supabase
        .from("businesses")
        .select("name, rating, review_count, category, address, has_website")
        .eq("id", businessId)
        .single();

      if (!business) {
        return NextResponse.json(
          { success: false, error: "Business not found" },
          { status: 404 }
        );
      }

      html = buildHtmlEmail({
        businessName: business.name,
        rating: business.rating,
        reviewCount: business.review_count,
        category: business.category,
        address: business.address,
        hasWebsite: business.has_website,
      }, htmlOverrides);
      logBody = HTML_TEMPLATE_MARKER;
    } else {
      // Standard plain-text email flow
      if (!emailBody) {
        return NextResponse.json(
          { success: false, error: "Missing email body" },
          { status: 400 }
        );
      }
      if (emailBody.length > 50000) {
        return NextResponse.json(
          { success: false, error: "Email body must be at most 50000 characters" },
          { status: 400 }
        );
      }

      const htmlBody = escapeHtml(emailBody)
        .replace(/\n/g, "<br>")
        .replace(/  /g, "&nbsp;&nbsp;");

      html = `<div style="font-family: Arial, sans-serif; line-height: 1.6;">${htmlBody}</div>`;
      logBody = emailBody;
    }

    // Send email via Resend
    const result = await sendEmail({
      to: recipientEmail,
      subject,
      html,
    });

    const supabase = createServerSupabaseClient();

    // Log sent email
    await supabase.from("sent_emails").insert({
      business_id: businessId || null,
      template_id: templateId || null,
      recipient_email: recipientEmail,
      subject,
      body: logBody,
      status: "sent",
      resend_id: result?.id || null,
    });

    return NextResponse.json({
      success: true,
      message: "Email sent successfully",
      resend_id: result?.id,
    });
  } catch (error) {
    console.error("Send email error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "An internal error occurred",
      },
      { status: 500 }
    );
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
