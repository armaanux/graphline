import { nanoid } from "nanoid";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

/**
 * Anonymous session id in an httpOnly cookie. SECURITY: cases are scoped to it,
 * so a visitor can only access their own investigations.
 */
const COOKIE = "gl_sid";
const SID_RE = /^[A-Za-z0-9_-]{16,40}$/;

export function newSid(): string {
  return nanoid(24);
}

export function isValidSid(v: string | undefined | null): v is string {
  return !!v && SID_RE.test(v);
}

/** Read the session id from a route-handler request. */
export function sidFromRequest(req: NextRequest): string | null {
  const v = req.cookies.get(COOKIE)?.value;
  return isValidSid(v) ? v : null;
}

/** Read the session id in a Server Component / server context. */
export async function sidFromContext(): Promise<string | null> {
  const v = (await cookies()).get(COOKIE)?.value;
  return isValidSid(v) ? v : null;
}

/** Set-Cookie header value for a new session. */
export function sidCookie(sid: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${sid}; Path=/; Max-Age=7776000; HttpOnly; SameSite=Lax${secure}`;
}
