// Sends a test email to yourself: `npm run email:check` (optionally: npm run email:check -- someone@example.com)
import { emailConfig, sendEmail, verifyEmail } from "../src/lib/email/mailer";
import { testEmail } from "../src/lib/email/templates";
import { maskEmail } from "../src/lib/rwanda";
import { prisma } from "../src/lib/prisma";

(async () => {
  const cfg = emailConfig();
  console.log(`Provider: ${cfg.provider} · configured: ${cfg.configured}${cfg.missing.length ? ` · missing: ${cfg.missing.join(", ")}` : ""}`);
  const check = await verifyEmail(true);
  console.log(`Connection: ${check.ok ? "OK" : `FAILED — ${check.error}`}`);
  if (!check.ok) process.exit(1);

  const to = process.argv[2] || cfg.senderEmail!;
  const result = await sendEmail({ type: "test", to, ...testEmail(cfg.provider) });
  console.log(`Test email to ${maskEmail(to)}: ${result.status}${result.error ? ` — ${result.error}` : ""}`);
  await prisma.$disconnect();
  if (result.status !== "SENT") process.exit(1);
})();
