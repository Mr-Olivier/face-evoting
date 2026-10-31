import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { config } from "@/lib/config";
import { jsonError, readJson } from "@/lib/api";
import { ADMIN_COOKIE, cookieOptions, signAdminSession } from "@/lib/auth";

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export async function POST(req: Request) {
  const parsed = z.object({ password: z.string() }).safeParse(await readJson(req));
  if (!parsed.success || !safeEqual(parsed.data.password, config.adminPassword)) {
    return jsonError("Incorrect password.", 401);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, await signAdminSession(), cookieOptions(config.adminSessionHours * 3600));
  return res;
}
