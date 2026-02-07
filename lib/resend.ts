import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;

let resendClient: Resend | null = null;

export function getResendClient(): Resend {
  if (!resendClient) {
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is not configured");
    }
    resendClient = new Resend(resendApiKey);
  }
  return resendClient;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export async function sendEmail({
  to,
  subject,
  html,
  from = "Oliver Van Droogenbroeck <webdev@olivervdb.com>",
}: SendEmailParams) {
  const resend = getResendClient();

  const result = await resend.emails.send({
    from,
    to,
    subject,
    html,
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data;
}
