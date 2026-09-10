"use client";

import { apiFetch } from "@/lib/api-client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { resolveLandingHref } from "@/lib/session";
import "./login.css";

type Step = "login" | "reset-password" | "totp-setup" | "totp-challenge" | "recovery-codes";

function persistSession(session_key: string, user: unknown) {
  localStorage.setItem("spiderx_session", session_key);
  localStorage.setItem("spiderx_user", JSON.stringify(user));
}

/**
 * Where the route gate wanted us to go, read at submit time from the address bar.
 *
 * Deliberately not `useSearchParams`: that opts the whole subtree out of static
 * rendering, which would leave the login page blank until hydration — the very
 * flash this change set exists to remove.
 *
 * Only same-origin paths are honoured, so `?redirectedUrl=https://evil.example`
 * (or a protocol-relative `//evil.example`) cannot bounce a user off-site.
 */
function wantedRedirect(): string | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("redirectedUrl");
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

export default function LoginClient() {
  const router = useRouter();
  const [show, setShow] = React.useState(false);
  const [user, setUser] = React.useState("");
  const [pass, setPass] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [step, setStep] = React.useState<Step>("login");
  const [userId, setUserId] = React.useState("");
  const [oldPass, setOldPass] = React.useState("");
  const [newPass, setNewPass] = React.useState("");
  const [confirmPass, setConfirmPass] = React.useState("");
  const [totpSecret, setTotpSecret] = React.useState("");
  const [otpauth, setOtpauth] = React.useState("");
  const [qrCodeUrl, setQrCodeUrl] = React.useState("");
  const [totpCode, setTotpCode] = React.useState("");
  const [useRecovery, setUseRecovery] = React.useState(false);
  const [failCount, setFailCount] = React.useState(0);
  const [recoveryCodes, setRecoveryCodes] = React.useState<string[]>([]);
  const [pendingFinish, setPendingFinish] = React.useState<Record<string, unknown> | null>(null);

  // 2-minute challenge timeout, matching vehere-ui's TwoFactorAuthPage.
  React.useEffect(() => {
    if (step !== "totp-challenge" && step !== "totp-setup") return;
    const t = setTimeout(() => {
      setStep("login");
      setError("Authenticator session expired — sign in again");
      setTotpCode("");
    }, 2 * 60 * 1000);
    return () => clearTimeout(t);
  }, [step]);

  async function sessionPost(body: Record<string, unknown>) {
    const res = await apiFetch("/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Request failed");
    return json;
  }

  function finishOk(json: Record<string, any>) {
    if (json.session_key && json.user) {
      persistSession(json.session_key, json.user);
    }
    // Honour the deep link the route gate stashed before bouncing us here.
    router.replace(wantedRedirect() || resolveLandingHref(json.user?.landingPage));
  }

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const json = await sessionPost({ action: "login", user_id: user, user_pass: pass });
      const next = String(json.next || "ok");
      setUserId(json.user_id || user);
      if (next === "ok") return finishOk(json);
      if (next === "reset-password") {
        setStep("reset-password");
        setOldPass(pass);
        return;
      }
      if (next === "totp-challenge") {
        setUseRecovery(false);
        setFailCount(0);
        setStep("totp-challenge");
        return;
      }
      if (next === "totp-setup") {
        const gen = await sessionPost({ action: "totp-setup-generate" });
        setTotpSecret(gen.secret || "");
        setOtpauth(gen.otpauth || "");
        setQrCodeUrl(gen.qrCodeUrl || "");
        setStep("totp-setup");
        return;
      }
      setError(`Unhandled next step: ${next}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function onResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPass !== confirmPass) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await sessionPost({
        action: "reset-password",
        user_id: userId || user,
        old_pass: oldPass,
        new_pass: newPass,
      });
      setPass("");
      setNewPass("");
      setConfirmPass("");
      setOldPass("");
      setStep("login");
      setNotice("Password updated. Sign in again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  async function onTotpSetup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const json = await sessionPost({
        action: "totp-setup-verify",
        secret: totpSecret,
        token: totpCode,
      });
      if (Array.isArray(json.recoveryCodes) && json.recoveryCodes.length) {
        setRecoveryCodes(json.recoveryCodes);
        setPendingFinish(json);
        setStep("recovery-codes");
        return;
      }
      finishOk(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "TOTP setup failed");
    } finally {
      setLoading(false);
    }
  }

  async function onTotpChallenge(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const json = await sessionPost({
        action: "totp-validate",
        ...(useRecovery ? { recoveryCode: totpCode } : { token: totpCode }),
      });
      finishOk(json);
    } catch (err) {
      const nextFails = failCount + 1;
      setFailCount(nextFails);
      setTotpCode("");
      if (!useRecovery && nextFails >= 5) {
        setUseRecovery(true);
        setError("Too many failed attempts — use a recovery code");
      } else {
        setError(err instanceof Error ? err.message : "Invalid code");
      }
    } finally {
      setLoading(false);
    }
  }

  const heading =
    step === "login"
      ? "Welcome!"
      : step === "reset-password"
        ? "Reset password"
        : step === "totp-setup"
          ? "Set up authenticator"
          : step === "recovery-codes"
            ? "Save recovery codes"
            : useRecovery
              ? "Recovery code"
              : "Authenticator code";

  const subheading =
    step === "login"
      ? "Login to access your account"
      : step === "reset-password"
        ? "Choose a new password to continue"
        : step === "totp-setup"
          ? "Scan the QR with your authenticator, then confirm with a code"
          : step === "recovery-codes"
            ? "Store these codes offline — each works once if you lose your device"
            : useRecovery
              ? "Enter one unused recovery code"
              : "Enter the 6-digit code from your authenticator";

  return (
    <main className="login-root">
      {/* Brand mark, pinned to the top-left over the full-bleed background. */}
      <header className="login-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/login/vehere-logo.svg" alt="Vehere" width={130} height={48} />
        <span className="login-brand-divider" aria-hidden="true" />
        <span className="login-brand-product">SPIDER-X</span>
      </header>

      <div className="login-grid">
        {/* Left: the form */}
        <section className="login-form-col">
          <div className="login-form-wrap">
            <h1 className="login-heading">{heading}</h1>
            <p className="login-subheading">{subheading}</p>

            {error && (
              <p className="login-alert login-alert-error" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className="login-alert login-alert-notice" role="status">
                {notice}
              </p>
            )}

            {step === "login" && (
              <form onSubmit={onLogin} noValidate>
                <label className="login-label" htmlFor="username">
                  Username
                </label>
                <input
                  id="username"
                  className="login-input"
                  placeholder="Username"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  required
                />

                <label className="login-label" htmlFor="password">
                  Password
                </label>
                <div className="login-input-group">
                  <input
                    id="password"
                    className="login-input"
                    placeholder="Password"
                    type={show ? "text" : "password"}
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="login-eye"
                    onClick={() => setShow((s) => !s)}
                    aria-label={show ? "Hide password" : "Show password"}
                  >
                    {show ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                <button type="submit" className="login-submit" disabled={loading}>
                  {loading ? "Signing in…" : "Login"}
                </button>
              </form>
            )}

            {step === "reset-password" && (
              <form onSubmit={onResetPassword} noValidate>
                <label className="login-label" htmlFor="old-pass">
                  Current password
                </label>
                <input
                  id="old-pass"
                  className="login-input"
                  type="password"
                  value={oldPass}
                  onChange={(e) => setOldPass(e.target.value)}
                  autoComplete="current-password"
                />
                <label className="login-label" htmlFor="new-pass">
                  New password
                </label>
                <input
                  id="new-pass"
                  className="login-input"
                  type="password"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <label className="login-label" htmlFor="confirm-pass">
                  Confirm password
                </label>
                <input
                  id="confirm-pass"
                  className="login-input"
                  type="password"
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button type="submit" className="login-submit" disabled={loading}>
                  {loading ? "Saving…" : "Update password"}
                </button>
                <button type="button" className="login-link" onClick={() => setStep("login")}>
                  Back to sign in
                </button>
              </form>
            )}

            {step === "totp-setup" && (
              <form onSubmit={onTotpSetup} noValidate>
                {qrCodeUrl && (
                  <div className="login-qr">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrCodeUrl} alt="TOTP QR code" width={180} height={180} />
                  </div>
                )}
                <label className="login-label" htmlFor="totp-secret">
                  Manual secret
                </label>
                <input
                  id="totp-secret"
                  className="login-input login-input-mono"
                  readOnly
                  value={totpSecret}
                  onFocus={(e) => e.currentTarget.select()}
                />
                {otpauth && <p className="login-otpauth">{otpauth}</p>}
                <label className="login-label" htmlFor="totp-setup-code">
                  Authenticator code
                </label>
                <input
                  id="totp-setup-code"
                  className="login-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  required
                />
                <button type="submit" className="login-submit" disabled={loading || !totpCode}>
                  {loading ? "Verifying…" : "Verify & continue"}
                </button>
              </form>
            )}

            {step === "recovery-codes" && (
              <div>
                <ul className="login-recovery">
                  {recoveryCodes.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="login-secondary"
                  onClick={() => navigator.clipboard.writeText(recoveryCodes.join("\n"))}
                >
                  Copy codes
                </button>
                <button
                  type="button"
                  className="login-submit"
                  onClick={() => pendingFinish && finishOk(pendingFinish)}
                >
                  I saved them — continue
                </button>
              </div>
            )}

            {step === "totp-challenge" && (
              <form onSubmit={onTotpChallenge} noValidate>
                <label className="login-label" htmlFor="totp-code">
                  {useRecovery ? "Recovery code" : "Authenticator code"}
                </label>
                <input
                  id="totp-code"
                  className="login-input"
                  inputMode={useRecovery ? "text" : "numeric"}
                  autoComplete="one-time-code"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  autoFocus
                  required
                />
                <button type="submit" className="login-submit" disabled={loading || !totpCode}>
                  {loading ? "Verifying…" : "Verify"}
                </button>
                <button
                  type="button"
                  className="login-link"
                  onClick={() => {
                    setUseRecovery((v) => !v);
                    setTotpCode("");
                    setError(null);
                  }}
                >
                  {useRecovery ? "Use authenticator code" : "Use recovery code"}
                </button>
                <button
                  type="button"
                  className="login-link"
                  onClick={() => {
                    setStep("login");
                    setTotpCode("");
                  }}
                >
                  Back to sign in
                </button>
              </form>
            )}
          </div>
        </section>

        {/* Right: product identity. Decorative, so it drops away on narrow screens. */}
        <section className="login-hero" aria-hidden="true">
          <h2 className="login-hero-title">Vehere Spider-X</h2>
          <p className="login-hero-sub">Real-time, Continuous, IP Signal Analysis System</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="login-hero-globe" src="/assets/login/globe.svg" alt="" />
        </section>
      </div>
    </main>
  );
}
