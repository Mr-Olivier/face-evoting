import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { getElectionResults } from "@/lib/results";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return jsonError("Unauthorized", 401);
  return NextResponse.json({ ok: true, elections: await getElectionResults() });
}
