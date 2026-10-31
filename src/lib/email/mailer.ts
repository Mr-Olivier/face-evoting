// Transactional email. Provider is chosen by EMAIL_PROVIDER:
//   "gmail" — Gmail SMTP with an App Password (nodemailer)
//   "brevo" — Brevo HTTP API (https://developers.brevo.com/reference/sendtransacemail)
// Server only. If the chosen provider isn't configured the email is skipped and logged,
// so registration and voting keep working.
import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "../prisma";
import { maskEmail } from "../rwanda";

export type EmailType = "registration" | "vote_confirmation" | "pin_reset_code" | "pin_changed" | "test";
export type SendResult = { status: "SENT" | "FAILED" | "SKIPPED"; providerId?: string; error?: string };
export type Provider = "gmail" | "brevo";

export function emailConfig() {
  const provider: Provider = process.env.EMAIL_PROVIDER?.trim().toLowerCase() === "brevo" ? "brevo" : "gmail";
  const senderName = process.env.EMAIL_SENDER_NAME?.trim() || process.env.BREVO_SENDER_NAME?.trim() || "FaceVote";
  if (provider === "gmail") {
    const user = process.env.GMAIL_USER?.trim();
    // Google displays App Passwords in groups of four ("abcd efgh ijkl mnop"); spaces are not part of it.
    const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
    return {
      provider,
      configured: Boolean(user && pass),
      senderEmail: user,
      senderName,
      secretHint: pass ? `${pass.slice(0, 2)}••••••••••••${pass.slice(-2)}` : undefined,
      missing: [!user && "GMAIL_USER", !pass && "GMAIL_APP_PASSWORD"].filter(Boolean) as string[],
    };
  }
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim();
  return {
    provider,
    configured: Boolean(apiKey && senderEmail),
    senderEmail,
    senderName,
    secretHint: apiKey ? `${apiKey.slice(0, 8)}…` : undefined,
    missing: [!apiKey && "BREVO_API_KEY", !senderEmail && "BREVO_SENDER_EMAIL"].filter(Boolean) as string[],
  };
}

let gmail: Transporter | null = null;
function gmailTransport(user: string, pass: string) {
  gmail ??= nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  return gmail;
}

/** Raw error text including the system/SMTP code (e.g. "ETIMEDOUT", "421"). */
function rawError(e: unknown): string {
  const err = e as Error & { code?: string; responseCode?: number; cause?: { code?: string } };
  const code = err?.code ?? err?.cause?.code ?? (err?.responseCode ? String(err.responseCode) : "");
  const msg = err instanceof Error ? err.message : String(e);
  return code && !msg.includes(code) ? `${msg} [${code}]` : msg;
}

/** Network hiccups and temporary SMTP refusals are worth retrying; wrong passwords are not. */
const isTransient = (raw: string) =>
  /ETIMEDOUT|ECONNRESET|ECONNREFUSED|ESOCKET|ECONNECTION|EDNS|ENOTFOUND|EAI_AGAIN|ETEMP|EPIPE|socket hang up|Greeting never received|\b(421|450|451|452|454)\b|fetch failed|TimeoutError/i.test(raw);

/** Turns provider errors into something an admin can act on. */
function explain(provider: Provider, raw: string): string {
  const code = raw.match(/\[([A-Z0-9_]+)\]$/)?.[1];
  const suffix = code ? ` (${code})` : "";
  if (provider === "gmail") {
    if (/535|Username and Password not accepted|BadCredentials/i.test(raw))
      return "Gmail rejected the login. Check GMAIL_USER and use a 16-character App Password, not your normal Gmail password.";
    if (/534|Application-specific password required/i.test(raw))
      return "Gmail requires an App Password. Turn on 2-Step Verification, then create one at myaccount.google.com/apppasswords.";
    if (/550|5\.1\.1|does not exist|NoSuchUser/i.test(raw)) return "Gmail says this email address doesn't exist. Check the voter's email.";
    if (/ETIMEDOUT|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|ESOCKET|ECONNECTION|Greeting never received/i.test(raw))
      return `Could not reach smtp.gmail.com after several tries${suffix}. The internet connection dropped or a firewall/antivirus is blocking port 465.`;
  }
  return raw;
}

const RETRY_DELAYS_MS = [0, 2_000, 6_000]; // up to 3 attempts
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type EmailCheck = { ok: boolean; error?: string; checkedAt: Date };
let lastCheck: EmailCheck | null = null;

/**
 * Live connection test: logs in to Gmail SMTP (no email sent) or reads the Brevo account.
 * Cached for 60 s so the Integrations page stays fast.
 */
export async function verifyEmail(force = false): Promise<EmailCheck> {
  if (!force && lastCheck && Date.now() - lastCheck.checkedAt.getTime() < 60_000) return lastCheck;
  const cfg = emailConfig();
  let result: EmailCheck;
  if (!cfg.configured) {
    result = { ok: false, error: `Missing ${cfg.missing.join(", ")}.`, checkedAt: new Date() };
  } else if (cfg.provider === "gmail") {
    try {
      await gmailTransport(cfg.senderEmail!, process.env.GMAIL_APP_PASSWORD!.replace(/\s+/g, "")).verify();
      result = { ok: true, checkedAt: new Date() };
    } catch (e) {
      gmail = null;
      result = { ok: false, error: explain("gmail", e instanceof Error ? e.message : String(e)), checkedAt: new Date() };
    }
  } else {
    try {
      const res = await fetch("https://api.brevo.com/v3/account", {
        headers: { "api-key": process.env.BREVO_API_KEY!.trim(), accept: "application/json" },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      result = res.ok ? { ok: true, checkedAt: new Date() } : { ok: false, error: `Brevo rejected the API key (HTTP ${res.status}).`, checkedAt: new Date() };
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : "Could not reach Brevo.", checkedAt: new Date() };
    }
  }
  lastCheck = result;
  return result;
}

async function deliverOnce(cfg: ReturnType<typeof emailConfig>, msg: { to: string; toName?: string; subject: string; html: string; text: string; type: EmailType }): Promise<SendResult & { raw?: string }> {
  if (cfg.provider === "gmail") {
    try {
      const info = await gmailTransport(cfg.senderEmail!, process.env.GMAIL_APP_PASSWORD!.replace(/\s+/g, "")).sendMail({
        from: { name: cfg.senderName, address: cfg.senderEmail! },
        to: msg.toName ? { name: msg.toName, address: msg.to } : msg.to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      });
      return { status: "SENT", providerId: info.messageId };
    } catch (e) {
      gmail = null; // rebuild the connection next time (e.g. after fixing .env)
      return { status: "FAILED", raw: rawError(e) };
    }
  }

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": process.env.BREVO_API_KEY!.trim(), "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { name: cfg.senderName, email: cfg.senderEmail },
        to: [{ email: msg.to, name: msg.toName }],
        subject: msg.subject,
        htmlContent: msg.html,
        textContent: msg.text,
        tags: [msg.type],
      }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as { messageId?: string; message?: string; code?: string };
    if (res.ok) return { status: "SENT", providerId: body.messageId };
    const raw = `Brevo ${res.status}${body.code ? ` ${body.code}` : ""}: ${body.message ?? res.statusText}`;
    return { status: "FAILED", raw: res.status >= 500 || res.status === 429 ? `${raw} [ETEMP]` : raw };
  } catch (e) {
    return { status: "FAILED", raw: rawError(e) };
  }
}

/** Sends with automatic retries for temporary problems (network drops, 4xx-temporary SMTP replies). */
async function deliver(msg: { to: string; toName?: string; subject: string; html: string; text: string; type: EmailType }): Promise<SendResult> {
  const cfg = emailConfig();
  if (!cfg.configured) return { status: "SKIPPED", error: `Email is not configured (${cfg.provider}): missing ${cfg.missing.join(", ")}.` };
  let last: SendResult & { raw?: string } = { status: "FAILED" };
  for (const [i, delay] of RETRY_DELAYS_MS.entries()) {
    if (delay) await sleep(delay);
    last = await deliverOnce(cfg, msg);
    if (last.status === "SENT") return last;
    if (!isTransient(last.raw ?? "")) break;
    console.warn(`[email] ${msg.type} attempt ${i + 1} failed (${last.raw}); ${i + 1 < RETRY_DELAYS_MS.length ? "retrying" : "giving up"}`);
  }
  return { status: "FAILED", error: explain(cfg.provider, last.raw ?? "Unknown error") };
}

export async function sendEmail(msg: { type: EmailType; to: string; toName?: string; subject: string; html: string; text: string }): Promise<SendResult> {
  const result = await deliver(msg);
  try {
    await prisma.emailLog.create({
      data: { type: msg.type, toMasked: maskEmail(msg.to), status: result.status, providerId: result.providerId, error: result.error },
    });
  } catch (e) {
    console.error("[email] could not write EmailLog", e);
  }
  if (result.status !== "SENT") console.warn(`[email] ${msg.type} to ${maskEmail(msg.to)}: ${result.status} — ${result.error}`);
  return result;
}
