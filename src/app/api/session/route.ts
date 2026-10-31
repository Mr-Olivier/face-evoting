import { NextResponse } from "next/server";
import { PREAUTH_COOKIE, VOTER_COOKIE } from "@/lib/auth";

// DELETE /api/session — voter cancels / logs out (clears both stages)
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(VOTER_COOKIE);
  res.cookies.delete(PREAUTH_COOKIE);
  return res;
}
