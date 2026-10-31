import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

/**
 * Keeps the admin console out of public view.
 *
 * - The login page lives at a secret path (ADMIN_LOGIN_PATH, e.g. "/staff-7k2p").
 *   That path is rewritten to /admin/login; it is never linked anywhere.
 * - Any /admin URL requested without a valid admin session returns a plain 404,
 *   so visitors can't even tell the console exists.
 * - If ADMIN_LOGIN_PATH is not set, /admin/login is reachable directly (dev only).
 *
 * API routes check admin auth themselves (see isAdmin()).
 */
const DEFAULT_LOGIN = "/admin/login";

function loginPath() {
  const p = (process.env.ADMIN_LOGIN_PATH ?? "").trim().replace(/\/+$/, "");
  return p && p.startsWith("/") && !p.startsWith("/admin") && !p.startsWith("/api") ? p : DEFAULT_LOGIN;
}

async function hasAdminSession(req: NextRequest) {
  const token = req.cookies.get("admin_session")?.value;
  const secret = process.env.JWT_SECRET;
  if (!token || !secret) return false;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
    return payload.typ === "admin";
  } catch {
    return false;
  }
}

const notFound = (req: NextRequest) => NextResponse.rewrite(new URL("/__not-found", req.url));

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const secretLogin = loginPath();

  if (secretLogin !== DEFAULT_LOGIN && pathname === secretLogin) {
    if (await hasAdminSession(req)) return NextResponse.redirect(new URL("/admin", req.url));
    return NextResponse.rewrite(new URL(DEFAULT_LOGIN, req.url));
  }

  if (pathname !== "/admin" && !pathname.startsWith("/admin/")) return NextResponse.next();

  const authed = await hasAdminSession(req);
  if (pathname === DEFAULT_LOGIN) {
    if (authed) return NextResponse.redirect(new URL("/admin", req.url));
    return secretLogin === DEFAULT_LOGIN ? NextResponse.next() : notFound(req);
  }
  return authed ? NextResponse.next() : notFound(req);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|models|candidates|favicon.ico).*)"],
};
