import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth";
import { updateElectionSchema } from "@/lib/validation";
import { jsonError, readJson, zodError } from "@/lib/api";

// PATCH /api/admin/elections/:id   Body: { status: "DRAFT" | "OPEN" | "CLOSED" }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return jsonError("Unauthorized", 401);
  const { id } = await params;
  const parsed = updateElectionSchema.safeParse(await readJson(req));
  if (!parsed.success) return zodError(parsed.error);

  // Only one election may be OPEN at a time
  if (parsed.data.status === "OPEN") {
    await prisma.election.updateMany({ where: { status: "OPEN", NOT: { id } }, data: { status: "CLOSED" } });
  }
  const election = await prisma.election.update({ where: { id }, data: { status: parsed.data.status } });
  return NextResponse.json({ ok: true, election });
}
