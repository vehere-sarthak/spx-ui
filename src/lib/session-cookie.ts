import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { md5 } from "@/lib/api-utils";
import { getSessionMaxAgeSec, getSessionSecret, sslEnabled } from "@/lib/app-config";

const COOKIE = "spiderx_sid";

export type SessionPayload = {
  session_key: string;
  user_id: string;
  role_id?: number;
  role_name?: string;
  permissions: string[];
  exp: number; // unix sec
};

function secret() {
  return getSessionSecret();
}

function sign(data: string) {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

export function encodeSession(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function decodeSession(token?: string | null): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionFromRequest(req: NextRequest): SessionPayload | null {
  return decodeSession(req.cookies.get(COOKIE)?.value);
}

export function setSessionCookie(res: NextResponse, payload: SessionPayload) {
  const maxAge = getSessionMaxAgeSec();
  res.cookies.set(COOKIE, encodeSession(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" || sslEnabled(),
    path: "/",
    maxAge,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export function newSessionKey(user_id: string) {
  return md5(`${user_id}:${Date.now()}:${randomBytes(8).toString("hex")}`);
}

export { COOKIE as SESSION_COOKIE };
