import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/resend";

interface SendEmailRequest {
  recipientEmail: string;
  subject: string;
  body: string;
  businessId?: string;
  templateId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: SendEmailRequest = await request.json();
    const { recipientEmail, subject, body: emailBody, businessId, templateId } = body;

    if (!recipientEmail || !subject || !emailBody) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Convert plain text to HTML
    const htmlBody = emailBody
      .replace(/\n/g, "<br>")
      .replace(/  /g, "&nbsp;&nbsp;");

    // Send email via Resend
    const result = await sendEmail({
      to: recipientEmail,
      subject,
      html: `<div style="font-family: Arial, sans-serif; line-height: 1.6;">${htmlBody}</div>`,
    });

    const supabase = createServerSupabaseClient();

    // Log sent email
    await supabase.from("sent_emails").insert({
      business_id: businessId || null,
      template_id: templateId || null,
      recipient_email: recipientEmail,
      subject,
      body: emailBody,
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
        error: error instanceof Error ? error.message : "Failed to send email",
      },
      { status: 500 }
    );
  }
}
