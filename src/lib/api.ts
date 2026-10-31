import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import { toFieldErrors } from "./validation";

/**
 * Error contract for every API route:
 *   { ok: false, code: "WRONG_PIN", error: "What went wrong", hint?: "What to do next", fieldErrors?: {...} }
 * `code` is stable (the UI can branch on it); `error` and `hint` are written for people.
 */
export type ApiErrorBody = {
  ok: false;
  code: string;
  error: string;
  hint?: string;
  fieldErrors?: Record<string, string>;
  [key: string]: unknown;
};

export function apiError(
  code: string,
  status: number,
  error: string,
  extra: { hint?: string; fieldErrors?: Record<string, string>; [key: string]: unknown } = {},
) {
  return NextResponse.json<ApiErrorBody>({ ok: false, code, error, ...extra }, { status });
}

/** Backwards-compatible helper for simple errors. */
export function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  const code = status === 401 ? "UNAUTHORIZED" : status === 404 ? "NOT_FOUND" : status === 409 ? "CONFLICT" : "ERROR";
  return apiError(code, status, message, extra);
}

export function zodError(error: ZodError) {
  const fieldErrors = toFieldErrors(error);
  const count = Object.keys(fieldErrors).length;
  return apiError("VALIDATION_FAILED", 400, count > 1 ? `Please correct the ${count} highlighted fields.` : (error.issues[0]?.message ?? "Invalid request."), {
    fieldErrors,
  });
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export const unauthorized = () => apiError("UNAUTHORIZED", 401, "Your admin session has ended.", { hint: "Sign in again to continue." });
