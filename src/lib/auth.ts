import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { config } from "./config";

export const VOTER_COOKIE = "voter_session";
export const ADMIN_COOKIE = "admin_session";

export type VoterSession = { voterId: string; electionId: string; expiresAt?: number };

const isProd = process.env.NODE_ENV === "production";

export const cookieOptions = (maxAgeSeconds: number) => ({
  httpOnly: true,
  secure: isProd,
  sameSite: "strict" as const,
  path: "/",
  maxAge: maxAgeSeconds,
});

// ---------- Voter session (short-lived, issued after face + PIN verification) ----------

export async function signVoterSession(session: VoterSession): Promise<string> {
  return new SignJWT({ eid: session.electionId, typ: "voter" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.voterId)
    .setIssuedAt()
    .setExpirationTime(`${config.voterSessionMinutes}m`)
    .sign(config.jwtSecret);
}

export async function verifyVoterToken(token: string | undefined): Promise<VoterSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, config.jwtSecret, { algorithms: ["HS256"] });
    if (payload.typ !== "voter" || !payload.sub || typeof payload.eid !== "string") return null;
    return { voterId: payload.sub, electionId: payload.eid, expiresAt: payload.exp ? payload.exp * 1000 : undefined };
  } catch {
    return null;
  }
}

/** For server components / route handlers. */
export async function getVoterSession(): Promise<VoterSession | null> {
  const store = await cookies();
  return verifyVoterToken(store.get(VOTER_COOKIE)?.value);
}

// ---------- Pre-auth (credentials checked, face check pending) ----------

export const PREAUTH_COOKIE = "voter_preauth";

export async function signPreauth(session: { voterId: string; electionId: string }): Promise<string> {
  return new SignJWT({ eid: session.electionId, typ: "preauth" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.voterId)
    .setIssuedAt()
    .setExpirationTime(`${config.preauthMinutes}m`)
    .sign(config.jwtSecret);
}

export async function getPreauth(): Promise<{ voterId: string; electionId: string } | null> {
  const token = (await cookies()).get(PREAUTH_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, config.jwtSecret, { algorithms: ["HS256"] });
    if (payload.typ !== "preauth" || !payload.sub || typeof payload.eid !== "string") return null;
    return { voterId: payload.sub, electionId: payload.eid };
  } catch {
    return null;
  }
}

// ---------- Admin session ----------

export async function signAdminSession(): Promise<string> {
  return new SignJWT({ typ: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("admin")
    .setIssuedAt()
    .setExpirationTime(`${config.adminSessionHours}h`)
    .sign(config.jwtSecret);
}

export async function verifyAdminToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, config.jwtSecret, { algorithms: ["HS256"] });
    return payload.typ === "admin";
  } catch {
    return false;
  }
}

export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return verifyAdminToken(store.get(ADMIN_COOKIE)?.value);
}
