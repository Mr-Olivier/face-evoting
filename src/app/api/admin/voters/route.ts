import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { isAdmin } from "@/lib/auth";
import { averageDescriptor, euclideanDistance, samplesAreConsistent } from "@/lib/face-match";
import { registerVoterSchema } from "@/lib/validation";
import { apiError, readJson, unauthorized, zodError } from "@/lib/api";
import { newVoterNumber } from "@/lib/receipt";
import { sendVoterEmail } from "@/lib/email/voter-emails";
import { maskEmail } from "@/lib/rwanda";

export const dynamic = "force-dynamic";

// GET /api/admin/voters — list voters (never returns face data or PIN hashes)
export async function GET() {
  if (!(await isAdmin())) return unauthorized();
  const voters = await prisma.voter.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, voterNumber: true, firstName: true, lastName: true, district: true, isEligible: true, createdAt: true },
  });
  return NextResponse.json({ ok: true, voters });
}

/**
 * POST /api/admin/voters — register a voter (identity + PIN + 3–10 face samples).
 * Server-side checks, in order:
 *   1. field + cross-field validation (Rwandan ID structure, age, DOB/sex vs ID, district, PIN strength)
 *   2. face samples are consistent (same person, steady capture)
 *   3. the National ID isn't already registered
 *   4. the FACE isn't already registered under another ID (biometric de-duplication)
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const body = await readJson(req);
  const parsed = registerVoterSchema.safeParse(body);
  if (!parsed.success) return zodError(parsed.error);
  const d = parsed.data;
  // Officer confirmed the look-alike is a different person (checked the ID cards).
  const confirmedDifferent = (body as { confirmDifferentPerson?: unknown } | null)?.confirmDifferentPerson === true;

  const consistency = samplesAreConsistent(d.samples);
  if (!consistency.ok) {
    return apiError("INCONSISTENT_SAMPLES", 400, "The face samples look too different from each other.", {
      hint: "Recapture all samples in steady lighting, with only the voter in view and small head turns between captures.",
      maxDistance: consistency.maxDistance,
    });
  }

  const existing = await prisma.voter.findUnique({ where: { nationalId: d.nationalId }, select: { voterNumber: true } });
  if (existing) {
    return apiError("DUPLICATE_NATIONAL_ID", 409, `This National ID is already registered (voter ${existing.voterNumber}).`, {
      hint: "Each citizen can be registered only once. Search the voter list to review the existing record.",
      fieldErrors: { nationalId: `Already registered as ${existing.voterNumber}.` },
    });
  }

  const descriptor = averageDescriptor(d.samples);
  const enrolled = await prisma.voter.findMany({ select: { voterNumber: true, firstName: true, lastName: true, faceDescriptor: true } });
  let closest: { voterNumber: string; name: string; distance: number } | null = null;
  for (const v of enrolled) {
    if (v.faceDescriptor.length !== descriptor.length) continue;
    const distance = euclideanDistance(descriptor, v.faceDescriptor);
    if (!closest || distance < closest.distance) closest = { voterNumber: v.voterNumber, name: `${v.firstName} ${v.lastName}`, distance };
  }
  if (closest && closest.distance <= config.duplicateFaceThreshold) {
    const distance = Math.round(closest.distance * 1000) / 1000;
    if (!confirmedDifferent) {
      return apiError("DUPLICATE_FACE", 409, `This face looks very similar to ${closest.voterNumber} (${closest.name}).`, {
        hint: `Similarity distance ${distance.toFixed(2)} (lower = more alike; a possible duplicate is ≤ ${config.duplicateFaceThreshold}). If it's the same person, don't register them twice. If it's a different person, compare both ID cards and confirm below.`,
        distance,
        match: { voterNumber: closest.voterNumber, name: closest.name },
      });
    }
    console.warn(`[register] officer confirmed different person: new ${d.nationalId.slice(-4)} vs ${closest.voterNumber} (distance ${distance})`);
  }

  let voter = null;
  for (let attempt = 0; attempt < 5 && !voter; attempt++) {
    try {
      voter = await prisma.voter.create({
        data: {
          voterNumber: newVoterNumber(),
          nationalId: d.nationalId,
          firstName: d.firstName,
          lastName: d.lastName,
          dateOfBirth: new Date(`${d.dateOfBirth}T00:00:00Z`),
          sex: d.sex,
          phone: d.phone,
          email: d.email,
          province: d.province,
          district: d.district,
          sector: d.sector,
          cell: d.cell,
          village: d.village,
          pinHash: await bcrypt.hash(d.pin, 10),
          faceDescriptor: descriptor,
          consentAt: new Date(),
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const target = String((e.meta as { target?: string[] } | undefined)?.target ?? "");
        if (target.includes("nationalId")) {
          return apiError("DUPLICATE_NATIONAL_ID", 409, "This National ID was just registered.", { fieldErrors: { nationalId: "Already registered." } });
        }
        continue; // voter number collision — retry with a new one
      }
      throw e;
    }
  }
  if (!voter) return apiError("ERROR", 500, "Could not allocate a voter number.", { hint: "Please try again." });

  // Sent now (with automatic retries) so the officer sees whether it really arrived.
  let email: { to: string; status: "SENT" | "FAILED" | "SKIPPED"; error?: string } | null = null;
  if (voter.email) {
    const r = await sendVoterEmail(voter.id, "registration");
    email = { to: maskEmail(voter.email), status: "status" in r && (r.status === "SENT" || r.status === "FAILED" || r.status === "SKIPPED") ? r.status : "FAILED", error: "error" in r ? r.error : undefined };
  }

  return NextResponse.json(
    {
      ok: true,
      voter: { id: voter.id, voterNumber: voter.voterNumber, fullName: `${voter.firstName} ${voter.lastName}` },
      email,
    },
    { status: 201 },
  );
}
