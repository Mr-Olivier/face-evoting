import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth";
import { createElectionSchema } from "@/lib/validation";
import { jsonError, readJson, zodError } from "@/lib/api";

// POST /api/admin/elections — create a new election (starts as DRAFT)
export async function POST(req: Request) {
  if (!(await isAdmin())) return jsonError("Unauthorized", 401);
  const parsed = createElectionSchema.safeParse(await readJson(req));
  if (!parsed.success) return zodError(parsed.error);

  const election = await prisma.election.create({ data: { ...parsed.data, status: "DRAFT" } });
  return NextResponse.json({ ok: true, election }, { status: 201 });
}
