-- CreateEnum
CREATE TYPE "ElectionStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "Voter" (
    "id" TEXT NOT NULL,
    "voterNumber" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "faceDescriptor" DOUBLE PRECISION[],
    "isEligible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Voter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Election" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ElectionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Election_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "party" TEXT,
    "bio" TEXT,
    "photoUrl" TEXT,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Participation" (
    "id" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "votedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Participation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ballot" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,

    CONSTRAINT "Ballot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationAttempt" (
    "id" TEXT NOT NULL,
    "voterId" TEXT,
    "voterNumber" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "reason" TEXT,
    "distance" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Voter_voterNumber_key" ON "Voter"("voterNumber");

-- CreateIndex
CREATE INDEX "Candidate_electionId_idx" ON "Candidate"("electionId");

-- CreateIndex
CREATE UNIQUE INDEX "Participation_voterId_electionId_key" ON "Participation"("voterId", "electionId");

-- CreateIndex
CREATE INDEX "Ballot_electionId_idx" ON "Ballot"("electionId");

-- CreateIndex
CREATE INDEX "VerificationAttempt_voterNumber_createdAt_idx" ON "VerificationAttempt"("voterNumber", "createdAt");

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participation" ADD CONSTRAINT "Participation_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "Voter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participation" ADD CONSTRAINT "Participation_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ballot" ADD CONSTRAINT "Ballot_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ballot" ADD CONSTRAINT "Ballot_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationAttempt" ADD CONSTRAINT "VerificationAttempt_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "Voter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
