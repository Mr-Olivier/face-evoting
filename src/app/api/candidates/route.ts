import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/candidates — candidates of the currently OPEN election
export async function GET() {
  const election = await prisma.election.findFirst({
    where: { status: "OPEN" },
    include: { candidates: { orderBy: { name: "asc" } } },
  });
  if (!election) return NextResponse.json({ ok: true, election: null, candidates: [] });
  const { candidates, ...info } = election;
  return NextResponse.json({ ok: true, election: info, candidates });
}
