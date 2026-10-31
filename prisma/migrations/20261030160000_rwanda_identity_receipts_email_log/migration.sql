-- Rwandan voter identity, participation receipts, two-stage verification log, email outbox.
-- Data-preserving: existing rows are backfilled before columns become NOT NULL.

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE');
CREATE TYPE "EmailStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

-- ---------- Voter ----------
ALTER TABLE "Voter"
  ADD COLUMN "nationalId"  TEXT,
  ADD COLUMN "firstName"   TEXT,
  ADD COLUMN "lastName"    TEXT,
  ADD COLUMN "dateOfBirth" DATE,
  ADD COLUMN "sex"         "Sex",
  ADD COLUMN "phone"       TEXT,
  ADD COLUMN "email"       TEXT,
  ADD COLUMN "province"    TEXT,
  ADD COLUMN "district"    TEXT,
  ADD COLUMN "sector"      TEXT,
  ADD COLUMN "cell"        TEXT,
  ADD COLUMN "village"     TEXT,
  ADD COLUMN "consentAt"   TIMESTAMP(3),
  ADD COLUMN "updatedAt"   TIMESTAMP(3);

-- Backfill existing voters with structurally valid placeholder identities.
WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY "createdAt", id) AS n FROM "Voter"
)
UPDATE "Voter" v SET
  "firstName"   = split_part(v."fullName", ' ', 1),
  "lastName"    = COALESCE(NULLIF(trim(substr(v."fullName", length(split_part(v."fullName", ' ', 1)) + 1)), ''), split_part(v."fullName", ' ', 1)),
  "nationalId"  = '119908' || lpad(numbered.n::text, 7, '0') || '000',
  "dateOfBirth" = DATE '1990-01-01',
  "sex"         = 'MALE',
  "phone"       = '+250780000000',
  "province"    = 'Kigali City',
  "district"    = 'Gasabo',
  "sector"      = 'Kimironko',
  "cell"        = 'Bibare',
  "village"     = 'Imena',
  "consentAt"   = v."createdAt",
  "updatedAt"   = v."createdAt"
FROM numbered WHERE numbered.id = v.id;

ALTER TABLE "Voter"
  ALTER COLUMN "nationalId"  SET NOT NULL,
  ALTER COLUMN "firstName"   SET NOT NULL,
  ALTER COLUMN "lastName"    SET NOT NULL,
  ALTER COLUMN "dateOfBirth" SET NOT NULL,
  ALTER COLUMN "sex"         SET NOT NULL,
  ALTER COLUMN "phone"       SET NOT NULL,
  ALTER COLUMN "province"    SET NOT NULL,
  ALTER COLUMN "district"    SET NOT NULL,
  ALTER COLUMN "sector"      SET NOT NULL,
  ALTER COLUMN "cell"        SET NOT NULL,
  ALTER COLUMN "village"     SET NOT NULL,
  ALTER COLUMN "consentAt"   SET NOT NULL,
  ALTER COLUMN "updatedAt"   SET NOT NULL,
  DROP COLUMN "fullName";

CREATE UNIQUE INDEX "Voter_nationalId_key" ON "Voter"("nationalId");
CREATE INDEX "Voter_lastName_firstName_idx" ON "Voter"("lastName", "firstName");

-- ---------- Participation receipts ----------
ALTER TABLE "Participation" ADD COLUMN "receiptCode" TEXT;
UPDATE "Participation" SET "receiptCode" = 'FV-' || upper(substr(md5(id), 1, 4)) || '-' || upper(substr(md5(id), 5, 4));
ALTER TABLE "Participation" ALTER COLUMN "receiptCode" SET NOT NULL;
CREATE UNIQUE INDEX "Participation_receiptCode_key" ON "Participation"("receiptCode");

-- ---------- Verification attempts ----------
DROP INDEX "VerificationAttempt_voterNumber_createdAt_idx";
ALTER TABLE "VerificationAttempt" RENAME COLUMN "voterNumber" TO "identifier";
ALTER TABLE "VerificationAttempt"
  ADD COLUMN "stage"  TEXT NOT NULL DEFAULT 'face',
  ADD COLUMN "ipHash" TEXT;
ALTER TABLE "VerificationAttempt" ALTER COLUMN "stage" DROP DEFAULT;
-- Attempts linked to a voter now use that voter's National ID as identifier.
UPDATE "VerificationAttempt" a SET "identifier" = v."nationalId" FROM "Voter" v WHERE a."voterId" = v.id;
CREATE INDEX "VerificationAttempt_identifier_createdAt_idx" ON "VerificationAttempt"("identifier", "createdAt");
CREATE INDEX "VerificationAttempt_ipHash_createdAt_idx" ON "VerificationAttempt"("ipHash", "createdAt");

-- ---------- Email outbox ----------
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "toMasked" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL,
    "providerId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmailLog_createdAt_idx" ON "EmailLog"("createdAt");
