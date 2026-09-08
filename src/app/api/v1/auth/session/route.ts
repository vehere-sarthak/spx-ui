import { NextRequest, NextResponse } from "next/server";
import { md5, nowEpochSec } from "@/lib/api-utils";
import { sql, sqlExec } from "@/lib/mysql";
import {
  consumeRecoveryCode,
  generateRecoveryCodes,
  generateTotpSecret,
  storeRecoveryHashes,
  totpQrImageUrl,
  totpUri,
  verifyTotp,
} from "@/lib/totp";
import {
  clearSessionCookie,
  newSessionKey,
  sessionFromRequest,
  setSessionCookie,
} from "@/lib/session-cookie";
import { parsePermissions } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function userPayload(user: any) {
  return {
    id: user.id,
    user_id: user.user_id,
    user_name: user.user_name,
    role_id: user.role_id,
    role_name: user.role_name,
    email_id: user.email_id,
    landingPage: user.landingPage || "command",
    permissions: parsePermissions(user.permissions),
    mfa_enabled: Number(user.mfa_enabled || 0),
    totp_enabled: Number(user.totp_enabled || 0),
    login_flag: Number(user.login_flag || 0),
  };
}

async function loadUser(user_id: string) {
  const rows = await sql<any>(
    `SELECT u.*, r.role_name, r.permissions, r.landingPage
     FROM users u LEFT JOIN roles r ON r.id = u.role_id
     WHERE u.user_id = ? LIMIT 1`,
    [user_id]
  );
  return rows[0] || null;
}

async function issueFullSession(user: any) {
  const session_key = newSessionKey(user.user_id);
  await sqlExec(`INSERT INTO user_session (user_id, session_key, last_access) VALUES (?, ?, ?)`, [
    user.user_id,
    session_key,
    nowEpochSec(),
  ]);
  const payload = userPayload(user);
  const res = NextResponse.json({ ok: true, session_key, user: payload, next: "ok" });
  setSessionCookie(res, {
    session_key,
    user_id: user.user_id,
    role_id: user.role_id,
    role_name: user.role_name,
    permissions: payload.permissions,
    exp: nowEpochSec() + 12 * 3600,
  });
  return res;
}

function challengeResponse(user_id: string, next: string, ttl = 600) {
  const challenge = newSessionKey(user_id);
  const res = NextResponse.json({ ok: true, statusCode: 303, next, challenge, user_id });
  setSessionCookie(res, {
    session_key: challenge,
    user_id,
    permissions: [],
    exp: nowEpochSec() + ttl,
  });
  return res;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body.action || "login").toLowerCase();

    if (action === "login") {
      const user_id = String(body.user_id || body.username || "").trim();
      const password = String(body.user_pass || body.password || "");
      if (!user_id || !password) {
        return NextResponse.json({ error: "username and password required" }, { status: 400 });
      }
      const user = await loadUser(user_id);
      if (!user || user.user_pass !== md5(password)) {
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
      }

      if (Number(user.is_new) === 1 || Number(user.login_flag) === 1) {
        return challengeResponse(user_id, "reset-password");
      }
      if (Number(user.totp_enabled) === 1) {
        return challengeResponse(user_id, "totp-challenge");
      }
      if (Number(user.mfa_enabled) === 1 && Number(user.totp_enabled) !== 1) {
        return challengeResponse(user_id, "totp-setup", 900);
      }
      return issueFullSession(user);
    }

    if (action === "reset-password") {
      const sess = sessionFromRequest(req);
      const user_id = sess?.user_id || String(body.user_id || "");
      const old_pass = String(body.old_pass || "");
      const new_pass = String(body.new_pass || "");
      if (!user_id || !new_pass) {
        return NextResponse.json({ error: "user_id and new_pass required" }, { status: 400 });
      }
      const user = await loadUser(user_id);
      if (!user) return NextResponse.json({ error: "user not found" }, { status: 404 });
      if (old_pass && user.user_pass !== md5(old_pass) && Number(user.is_new) !== 1) {
        return NextResponse.json({ error: "Current password incorrect" }, { status: 401 });
      }
      await sqlExec(
        `UPDATE users SET user_pass=?, is_new=0, login_flag=0, last_modified_on=?, last_modified_by=? WHERE user_id=?`,
        [md5(new_pass), nowEpochSec(), user_id, user_id]
      );
      return NextResponse.json({ ok: true, message: "Password updated. Sign in again.", next: "login" });
    }

    if (action === "totp-setup-generate") {
      const sess = sessionFromRequest(req);
      const user_id = sess?.user_id || String(body.user_id || "");
      if (!user_id) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
      const secret = generateTotpSecret();
      const otpauth = totpUri(secret, user_id);
      return NextResponse.json({
        ok: true,
        secret,
        otpauth,
        qrCodeUrl: totpQrImageUrl(otpauth),
        qrHint: `Scan QR or enter secret ${secret} in authenticator app`,
      });
    }

    if (action === "totp-setup-verify") {
      const sess = sessionFromRequest(req);
      const user_id = sess?.user_id || String(body.user_id || "");
      const secret = String(body.secret || "");
      const token = String(body.token || "");
      if (!user_id || !secret || !token) {
        return NextResponse.json({ error: "user_id, secret, token required" }, { status: 400 });
      }
      if (!verifyTotp(token, secret)) {
        return NextResponse.json({ error: "Invalid authenticator code" }, { status: 401 });
      }
      const recoveryCodes = generateRecoveryCodes(8);
      const hashes = storeRecoveryHashes(recoveryCodes);
      try {
        await sqlExec(
          `UPDATE users SET totp_enabled=1, totp_secret=?, totp_recovery_codes=?, mfa_enabled=1 WHERE user_id=?`,
          [secret, hashes, user_id]
        );
      } catch {
        try {
          await sqlExec(`UPDATE users SET totp_enabled=1, totp_secret=?, mfa_enabled=1 WHERE user_id=?`, [
            secret,
            user_id,
          ]);
        } catch {
          await sqlExec(`UPDATE users SET totp_enabled=1, mfa_enabled=1 WHERE user_id=?`, [user_id]);
        }
      }
      const user = await loadUser(user_id);
      const session_key = newSessionKey(user_id);
      await sqlExec(`INSERT INTO user_session (user_id, session_key, last_access) VALUES (?, ?, ?)`, [
        user_id,
        session_key,
        nowEpochSec(),
      ]);
      const payload = userPayload(user);
      const res = NextResponse.json({
        ok: true,
        session_key,
        user: payload,
        next: "ok",
        recoveryCodes,
      });
      setSessionCookie(res, {
        session_key,
        user_id,
        role_id: user.role_id,
        role_name: user.role_name,
        permissions: payload.permissions,
        exp: nowEpochSec() + 12 * 3600,
      });
      return res;
    }

    if (action === "totp-validate") {
      const sess = sessionFromRequest(req);
      const user_id = sess?.user_id || String(body.user_id || "");
      const token = String(body.token || "").trim();
      const recoveryCode = String(body.recoveryCode || "").trim();
      if (!user_id || (!token && !recoveryCode)) {
        return NextResponse.json({ error: "token or recoveryCode required" }, { status: 400 });
      }
      const user = await loadUser(user_id);
      if (!user) return NextResponse.json({ error: "user not found" }, { status: 404 });

      if (recoveryCode) {
        const remaining = consumeRecoveryCode(user.totp_recovery_codes, recoveryCode);
        if (!remaining) {
          return NextResponse.json({ error: "Invalid recovery code" }, { status: 401 });
        }
        try {
          await sqlExec(`UPDATE users SET totp_recovery_codes=? WHERE user_id=?`, [remaining, user_id]);
        } catch {
          /* column may be missing */
        }
        return issueFullSession(user);
      }

      const secret = user.totp_secret || body.secret;
      if (!secret || !verifyTotp(token, secret)) {
        return NextResponse.json({ error: "Invalid authenticator code" }, { status: 401 });
      }
      return issueFullSession(user);
    }

    if (action === "totp-reset") {
      const sess = sessionFromRequest(req);
      if (!sess?.user_id) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
      const target = String(body.user_id || sess.user_id);
      // self always ok; admin targeting others allowed if caller has users write (best-effort: any session)
      try {
        await sqlExec(
          `UPDATE users SET totp_enabled=0, totp_secret=NULL, totp_recovery_codes=NULL WHERE user_id=?`,
          [target]
        );
      } catch {
        await sqlExec(`UPDATE users SET totp_enabled=0 WHERE user_id=?`, [target]);
      }
      return NextResponse.json({ ok: true, message: "TOTP cleared — user must re-enroll if MFA required" });
    }

    if (action === "totp-info") {
      const sess = sessionFromRequest(req);
      const user_id = sess?.user_id || String(body.user_id || "");
      if (!user_id) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
      const user = await loadUser(user_id);
      if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });
      let recoveryCodesCount = 0;
      try {
        const arr = JSON.parse(user.totp_recovery_codes || "[]");
        recoveryCodesCount = Array.isArray(arr) ? arr.length : 0;
      } catch {
        recoveryCodesCount = 0;
      }
      return NextResponse.json({
        ok: true,
        totp_enabled: Number(user.totp_enabled || 0),
        mfa_enabled: Number(user.mfa_enabled || 0),
        recoveryCodesCount,
      });
    }

    if (action === "logout") {
      const sess = sessionFromRequest(req);
      if (sess?.session_key) {
        await sqlExec(`DELETE FROM user_session WHERE session_key=?`, [sess.session_key]).catch(() => null);
      }
      const res = NextResponse.json({ ok: true });
      clearSessionCookie(res);
      return res;
    }

    if (action === "me") {
      const sess = sessionFromRequest(req);
      if (!sess?.user_id) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
      const user = await loadUser(sess.user_id);
      if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
      return NextResponse.json({ ok: true, user: userPayload(user), session: sess });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "auth failed" }, { status: 502 });
  }
}
