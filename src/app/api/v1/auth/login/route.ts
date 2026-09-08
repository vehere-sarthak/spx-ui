import { NextRequest } from "next/server";
import { POST as sessionPost } from "../session/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Legacy path — same MFA/TOTP gates as /api/v1/auth/session. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const forwarded = new NextRequest(new URL("/api/v1/auth/session", req.url), {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify({ ...body, action: "login" }),
  });
  return sessionPost(forwarded);
}
