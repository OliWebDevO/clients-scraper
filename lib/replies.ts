import type { SupabaseClient } from "@supabase/supabase-js";
import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import { SENDER } from "@/lib/prospect";

const FIRST_SYNC_SINCE = new Date("2026-11-10"); // start of the automatic outreach
const FREE_MAILBOX = /^(gmail|googlemail|hotmail|outlook|live|msn|yahoo|icloud|me|aol|gmx|proton|protonmail|skynet|telenet|proximus|scarlet|voo|orange)\./i;
const AUTO_SUBJECT =
  /absen|out of office|automatic reply|auto(matic)?[- ]?reply|réponse automatique|reponse automatique|automatisch antwoord|afwezig|accusé de réception|accuse de reception|abwesenheit/i;
// Where the quoted earlier message starts: everything from there on is cut
const QUOTE_START =
  /^(>|le .+ a écrit\s*:|on .+ wrote\s*:|op .+ schreef\s*:|-{2,}\s*(original message|message d'origine|message du)|de\s*:\s|from\s*:\s|envoyé\s*:|sent\s*:)/i;

type SyncState = { uid_validity: string; last_uid: number; checked_at?: string; last_error?: string };

/** The prospect's own words, without the quoted thread below */
function replyText(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const cut = lines.findIndex((line) => QUOTE_START.test(line.trim()));
  return (cut === -1 ? lines : lines.slice(0, cut)).join("\n").trim().slice(0, 20000);
}

function isAutoReply(mail: ParsedMail): boolean {
  const header = (name: string) => String(mail.headers.get(name) ?? "").toLowerCase();
  const autoSubmitted = header("auto-submitted");
  return (
    (autoSubmitted !== "" && autoSubmitted !== "no") ||
    mail.headers.has("x-autoreply") ||
    mail.headers.has("x-autorespond") ||
    /auto_reply|bulk|junk/.test(header("precedence")) ||
    AUTO_SUBJECT.test(mail.subject ?? "")
  );
}

/** Business we emailed at this address (or, for a company domain, at another address of the same domain) */
async function matchBusiness(supabase: SupabaseClient, from: string): Promise<string | null> {
  const exact = from.replace(/[\\%_]/g, "\\$&");
  const { data } = await supabase
    .from("sent_emails")
    .select("business_id")
    .ilike("recipient_email", exact)
    .not("business_id", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1);
  if (data?.[0]) return data[0].business_id as string;

  const domain = from.split("@")[1] ?? "";
  if (!domain || FREE_MAILBOX.test(domain)) return null;
  const { data: sameDomain } = await supabase
    .from("sent_emails")
    .select("business_id")
    .ilike("recipient_email", `%@${domain.replace(/[\\%_]/g, "\\$&")}`)
    .not("business_id", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1);
  return (sameDomain?.[0]?.business_id as string | undefined) ?? null;
}

/**
 * Read the new messages of the webdev@ inbox (without marking them as read), keep the ones sent by a
 * prospect we emailed, and mark that business as "replied": no follow-up goes out after a reply.
 */
export async function syncReplies(supabase: SupabaseClient): Promise<{ checked: number; saved: number; error?: string }> {
  const password = process.env.IMAP_PASSWORD;
  const { data: setting } = await supabase.from("settings").select("value").eq("key", "replies_sync").maybeSingle();
  const state = (setting?.value as SyncState | undefined) ?? null;
  // Shown on the Réponses page, so a broken connection never goes unnoticed
  const fail = async (message: string) => {
    await supabase
      .from("settings")
      .upsert({ key: "replies_sync", value: { ...(state ?? { uid_validity: "", last_uid: 0 }), last_error: message, checked_at: new Date().toISOString() } }, { onConflict: "key" });
    return { checked: 0, saved: 0, error: message };
  };
  if (!password) return fail("IMAP_PASSWORD manquant dans le .env du serveur");

  const client = new ImapFlow({
    host: process.env.IMAP_HOST || "imap.hostinger.com",
    port: 993,
    secure: true,
    auth: { user: process.env.IMAP_USER || SENDER.email, pass: password },
    logger: false,
  });

  let checked = 0;
  let saved = 0;
  try {
    await client.connect();
  } catch (err) {
    return fail(`Connexion à la boîte impossible : ${err instanceof Error ? err.message : String(err)}`);
  }
  const lock = await client.getMailboxLock("INBOX");
  try {
    const mailbox = client.mailbox;
    const uidValidity = mailbox ? String(mailbox.uidValidity) : "";
    const lastUid = state && state.uid_validity === uidValidity ? state.last_uid : 0;
    const found = await client.search(lastUid ? { uid: `${lastUid + 1}:*` } : { since: FIRST_SYNC_SINCE }, { uid: true });
    const uids = (found || []).filter((uid) => uid > lastUid);
    let maxUid = lastUid;

    if (uids.length) {
      for await (const message of client.fetch(uids, { uid: true, source: true }, { uid: true })) {
        checked++;
        maxUid = Math.max(maxUid, message.uid);
        if (!message.source) continue;
        const mail = await simpleParser(message.source);
        const from = mail.from?.value[0]?.address?.trim().toLowerCase();
        if (!from || from === SENDER.email) continue;

        const businessId = await matchBusiness(supabase, from);
        if (!businessId) continue; // not a prospect: the rest of the inbox is none of the app's business

        const autoReply = isAutoReply(mail);
        const { error } = await supabase.from("prospect_replies").upsert(
          {
            message_id: mail.messageId || `uid-${uidValidity}-${message.uid}`,
            business_id: businessId,
            from_email: from,
            from_name: mail.from?.value[0]?.name || null,
            subject: mail.subject || null,
            body: replyText(mail.text || ""),
            received_at: (mail.date ?? new Date()).toISOString(),
            auto_reply: autoReply,
            status: autoReply ? "handled" : "new",
          },
          { onConflict: "message_id", ignoreDuplicates: true }
        );
        if (error) throw new Error(error.message);
        saved++;
        // An out-of-office is not an answer: the follow-up may still go out
        if (!autoReply) await supabase.from("businesses").update({ replied: true }).eq("id", businessId);
      }
    }

    await supabase
      .from("settings")
      .upsert(
        { key: "replies_sync", value: { uid_validity: uidValidity, last_uid: maxUid, checked_at: new Date().toISOString() } },
        { onConflict: "key" }
      );
  } catch (err) {
    return fail(`Lecture de la boîte interrompue : ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
  return { checked, saved };
}
