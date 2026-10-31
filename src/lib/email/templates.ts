// Email templates. Table-based, inline-styled HTML for broad email-client support, plus plain text.
// A vote confirmation NEVER contains the voter's choice.
import { config } from "../config";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(opts: { preheader: string; heading: string; intro: string; rows: [string, string][]; body: string[]; footerNote: string; button?: { label: string; url: string }; code?: string }) {
  const rows = opts.rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:10px 0;border-bottom:1px solid #eef0f3;color:#5b6475;font-size:14px;">${esc(k)}</td>` +
        `<td style="padding:10px 0;border-bottom:1px solid #eef0f3;color:#0f172a;font-size:14px;font-weight:600;text-align:right;">${esc(v)}</td></tr>`,
    )
    .join("");
  const code = opts.code
    ? `<div style="margin:0 0 22px;padding:18px;background:#e8eefc;border-radius:12px;text-align:center;font-family:Consolas,'Courier New',monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:#1c44b8;">${esc(opts.code)}</div>`
    : "";
  const button = opts.button
    ? `<p style="margin:6px 0 20px;"><a href="${esc(opts.button.url)}" style="display:inline-block;background:#2453d6;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px;">${esc(opts.button.label)}</a></p>`
    : "";
  const paragraphs = opts.body.map((p) => `<p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.6;">${p}</p>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opts.heading)}</title></head>
<body style="margin:0;padding:0;background:#f6f7f9;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e5ea;border-radius:16px;overflow:hidden;">
<tr><td style="background:#2453d6;padding:20px 28px;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.2px;">FaceVote</td></tr>
<tr><td style="padding:28px;">
<h1 style="margin:0 0 8px;color:#0f172a;font-size:22px;line-height:1.3;">${esc(opts.heading)}</h1>
<p style="margin:0 0 20px;color:#5b6475;font-size:15px;line-height:1.6;">${opts.intro}</p>
${code}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">${rows}</table>
${paragraphs}
${button}
</td></tr>
<tr><td style="padding:18px 28px;background:#f1f3f6;color:#8a93a3;font-size:12px;line-height:1.6;">${opts.footerNote}<br>This is an automated message — please do not reply.</td></tr>
</table></td></tr></table></body></html>`;
}

function text(heading: string, intro: string, rows: [string, string][], body: string[]) {
  const strip = (s: string) => s.replace(/<[^>]+>/g, "");
  return [heading, "", strip(intro), "", ...rows.map(([k, v]) => `${k}: ${v}`), "", ...body.map(strip), "", "— FaceVote (automated message, do not reply)"].join("\n");
}

export function registrationEmail(v: {
  firstName: string;
  fullName: string;
  voterNumber: string;
  maskedNationalId: string;
  address: { village: string; cell: string; sector: string; district: string; province: string };
  registeredAt: string;
}) {
  const heading = "You are registered to vote";
  const intro = `Hello ${esc(v.firstName)}, your voter registration is complete. Keep this email: it has the details you need on voting day.`;
  const rows: [string, string][] = [
    ["Full name", v.fullName],
    ["Voter number", v.voterNumber],
    ["National ID", v.maskedNationalId],
    ["Village / cell", `${v.address.village}, ${v.address.cell}`],
    ["Sector / district", `${v.address.sector}, ${v.address.district}`],
    ["Province", v.address.province],
    ["Registered on", v.registeredAt],
  ];
  const body = [
    "<strong>How to vote:</strong> 1) open the voting site and enter your <strong>National ID number</strong> and the <strong>6-digit PIN you chose</strong> at registration, 2) check that your details are correct, 3) look at the camera and blink once, 4) choose your candidate and submit.",
    "<strong>Forgot your PIN?</strong> On the voting site, click <em>Forgot your PIN?</em>. A one-time code will be sent to this email address so you can choose a new one.",
    "<strong>Keep your PIN secret.</strong> It is never sent by email or SMS, and election officers will never ask for it.",
    `If you did not register, or any detail above is wrong, contact ${esc(config.electionOffice)}.`,
  ];
  return {
    subject: `Voter registration confirmed · ${v.voterNumber}`,
    html: layout({
      preheader: `Voter number ${v.voterNumber}`,
      heading,
      intro,
      rows,
      body,
      button: { label: "Go to the voting site", url: `${config.appUrl}/verify` },
      footerNote: "You received this because you registered as a voter.",
    }),
    text: text(heading, intro, rows, [...body, `Voting site: ${config.appUrl}/verify`]),
  };
}

export function pinResetCodeEmail(v: { firstName: string; code: string; minutes: number }) {
  const heading = "Your PIN reset code";
  const intro = `Hello ${esc(v.firstName)}, use this code to choose a new voter PIN. It expires in ${v.minutes} minutes and can be used once.`;
  const body = [
    "<strong>Never share this code.</strong> Election officers will never ask you for it.",
    "Didn't ask for this? Ignore this email. Your PIN has <strong>not</strong> been changed. If it keeps happening, contact " + esc(config.electionOffice) + ".",
  ];
  return {
    subject: `${v.code} is your FaceVote PIN reset code`,
    html: layout({ preheader: `Code ${v.code}, valid ${v.minutes} minutes`, heading, intro, rows: [], body, code: v.code, footerNote: "You received this because someone asked to reset the PIN for your voter registration." }),
    text: text(heading, intro, [["Code", v.code]], body),
  };
}

export function pinChangedEmail(v: { firstName: string; changedAt: string }) {
  const heading = "Your voter PIN was changed";
  const intro = `Hello ${esc(v.firstName)}, the PIN for your voter registration was changed.`;
  const rows: [string, string][] = [["Changed on", v.changedAt]];
  const body = [
    "Use your new PIN with your National ID number the next time you vote.",
    `<strong>Wasn't you?</strong> Contact ${esc(config.electionOffice)} immediately. Your registration may need to be secured.`,
  ];
  return {
    subject: "Your voter PIN was changed",
    html: layout({ preheader: "Security notice", heading, intro, rows, body, button: { label: "Go to the voting site", url: `${config.appUrl}/verify` }, footerNote: "Security notice sent to the email on your voter registration." }),
    text: text(heading, intro, rows, body),
  };
}

export function voteConfirmationEmail(v: { firstName: string; electionTitle: string; receiptCode: string; votedAt: string }) {
  const heading = "Your vote has been recorded";
  const intro = `Hello ${esc(v.firstName)}, thank you for voting. This confirms that you took part in the election below.`;
  const rows: [string, string][] = [
    ["Election", v.electionTitle],
    ["Recorded on", v.votedAt],
    ["Participation reference", v.receiptCode],
  ];
  const body = [
    "<strong>Your choice is secret.</strong> This email confirms only that you voted, not who you voted for. Your ballot is stored separately from your identity, and nothing links the two.",
    `<strong>Wasn't you?</strong> If you did not vote, someone may have used your identity. Contact ${esc(config.electionOffice)} immediately and quote the reference above.`,
  ];
  return {
    subject: `Vote confirmation: ${v.electionTitle}`,
    html: layout({ preheader: `Reference ${v.receiptCode}`, heading, intro, rows, body, footerNote: "You received this because a vote was cast with your voter registration." }),
    text: text(heading, intro, rows, body),
  };
}

export function testEmail(provider: "gmail" | "brevo") {
  const name = provider === "gmail" ? "Gmail" : "Brevo";
  const heading = `${name} is connected`;
  const intro = `This test message confirms that FaceVote can send registration and vote-confirmation emails through ${name}.`;
  const rows: [string, string][] = [["Sent at", new Date().toISOString()]];
  return {
    subject: "FaceVote test email",
    html: layout({ preheader: "Test email", heading, intro, rows, body: [], footerNote: "Sent from the FaceVote admin console." }),
    text: text(heading, intro, rows, []),
  };
}
