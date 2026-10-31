import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth";
import { updateVoterSchema } from "@/lib/validation";
import { jsonError, readJson, zodError } from "@/lib/api";

// PATCH /api/admin/voters/:id   Body: { isEligible }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return jsonError("Unauthorized", 401);
  const { id } = await params;
  const parsed = updateVoterSchema.safeParse(await readJson(req));
  if (!parsed.success) return zodError(parsed.error);

  try {
    const voter = await prisma.voter.update({
      where: { id },
      data: { isEligible: parsed.data.isEligible },
      select: { id: true, voterNumber: true, isEligible: true },
    });
    return NextResponse.json({ ok: true, voter });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") return jsonError("Voter not found.", 404);
    throw e;
  }
}
