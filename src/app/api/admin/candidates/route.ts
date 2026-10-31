import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth";
import { createCandidateSchema } from "@/lib/validation";
import { jsonError, readJson, zodError } from "@/lib/api";

// POST /api/admin/candidates — add a candidate to an election
export async function POST(req: Request) {
  if (!(await isAdmin())) return jsonError("Unauthorized", 401);
  const parsed = createCandidateSchema.safeParse(await readJson(req));
  if (!parsed.success) return zodError(parsed.error);

  const election = await prisma.election.findUnique({ where: { id: parsed.data.electionId } });
  if (!election) return jsonError("Election not found.", 404);
  if (election.status === "CLOSED") return jsonError("Cannot add candidates to a closed election.", 409);

  const candidate = await prisma.candidate.create({ data: parsed.data });
  return NextResponse.json({ ok: true, candidate }, { status: 201 });
}
