import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/resend";
import { isRateLimited, getClientIdentifier } from "@/lib/rate-limit";
import {
  buildHtmlEmail,
  HTML_TEMPLATE_MARKER,
  buildFollowUpHtmlEmail,
  businessToEmailData,
  FOLLOWUP_SITE_MARKER,
  FOLLOWUP_APP_MARKER,
  FOLLOWUP_BOTH_MARKER,
  type HtmlEmailOverrides,
  type FollowUpVariant,
  type FollowUpOverrides,
} from "@/lib/email-html-template";
import { checkEmail, htmlToText, OPT_OUT_TEXT } from "@/lib/email-checks";
import { SENDER } from "@/lib/prospect";
import { plainEmailToHtml } from "@/lib/outreach";

const BUSINESS_EMAIL_FIELDS =
  "name, rating, review_count, category, address, has_website, website_url, website_score, website_issues, email, do_not_contact, source, company_start_date";

/** Opt-out line injected at the bottom of designed HTML emails */
function withHtmlOptOut(html: string): string {
  const line = `<p style="margin: 0; padding: 16px 24px 32px; text-align: center; color: #8a8a8a; font-family: Arial, sans-serif; font-size: 12px; line-height: 1.5; background-color: #0d0b0e;">${escapeHtml(OPT_OUT_TEXT)}</p>`;
  return html.includes("</body>") ? html.replace("</body>", `${line}\n</body>`) : html + line;
}

interface SendEmailRequest {
  recipientEmail: string;
  subject: string;
  body: string;
  businessId?: string;
  templateId?: string;
  useHtmlTemplate?: boolean;
  htmlOverrides?: HtmlEmailOverrides;
  useFollowUpTemplate?: boolean;
  followUpVariant?: FollowUpVariant;
  followUpOverrides?: FollowUpOverrides;
}

export async function POST(request: NextRequest) {
  const clientIp = getClientIdentifier(request);
  if (isRateLimited("email-send", 20, 60 * 1000, clientIp)) {
    return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
  }

  try {
    const body: SendEmailRequest = await request.json();
    const { recipientEmail, subject, body: emailBody, businessId, templateId, useHtmlTemplate, htmlOverrides, useFollowUpTemplate, followUpVariant, followUpOverrides } = body;

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

    const recipient = recipientEmail.toLowerCase().trim();
    const supabase = createServerSupabaseClient();

    // Opt-out list: never email someone who asked to stop
    const { data: optOut } = await supabase
      .from("email_optouts")
      .select("email")
      .eq("email", recipient)
      .maybeSingle();
    if (optOut) {
      return NextResponse.json(
        { success: false, error: "Cette adresse a demandé à ne plus être contactée." },
        { status: 409 }
      );
    }

    let business: Parameters<typeof businessToEmailData>[0] & { email: string | null; do_not_contact: boolean } | null = null;
    if (businessId) {
      const { data } = await supabase.from("businesses").select(BUSINESS_EMAIL_FIELDS).eq("id", businessId).single();
      business = data;
      if (business?.do_not_contact) {
        return NextResponse.json(
          { success: false, error: "Ce business est marqué « ne plus contacter »." },
          { status: 409 }
        );
      }
    }

    let html: string;
    let logBody: string;

    const markerForVariant: Record<FollowUpVariant, string> = {
      site: FOLLOWUP_SITE_MARKER,
      app: FOLLOWUP_APP_MARKER,
      both: FOLLOWUP_BOTH_MARKER,
    };

    if (useFollowUpTemplate && businessId && followUpVariant) {
      // Build follow-up commercial proposal HTML email
      if (!business) {
        return NextResponse.json(
          { success: false, error: "Business not found" },
          { status: 404 }
        );
      }

      html = withHtmlOptOut(buildFollowUpHtmlEmail(businessToEmailData(business), followUpVariant, followUpOverrides));
      logBody = markerForVariant[followUpVariant];
    } else if (useHtmlTemplate && businessId) {
      // Build the designed HTML email from business data
      if (!business) {
        return NextResponse.json(
          { success: false, error: "Business not found" },
          { status: 404 }
        );
      }

      html = withHtmlOptOut(buildHtmlEmail(businessToEmailData(business), htmlOverrides));
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

      html = plainEmailToHtml(emailBody);
      logBody = emailBody;
    }

    // Plain-text part (better deliverability, and what the checks read)
    const text = htmlToText(html);

    const check = checkEmail({ subject, text, recipientEmail: recipient, businessName: business?.name });
    if (check.errors.length) {
      return NextResponse.json(
        { success: false, error: `Email bloqué : ${check.errors.join(" ")}` },
        { status: 400 }
      );
    }

    // Send email via Resend
    const result = await sendEmail({
      to: recipient,
      subject,
      html,
      text,
      headers: { "List-Unsubscribe": `<mailto:${SENDER.email}?subject=stop>` },
    });

    // Remember the address on the business (used for opt-outs and to pre-fill next time)
    if (businessId && business && !business.email) {
      await supabase.from("businesses").update({ email: recipient }).eq("id", businessId);
    }

    // Log sent email
    await supabase.from("sent_emails").insert({
      business_id: businessId || null,
      template_id: templateId || null,
      recipient_email: recipient,
      subject,
      body: logBody,
      status: "sent",
      kind: "first",
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
