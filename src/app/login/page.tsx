"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveLandingHref } from "@/lib/session";

type Step = "login" | "reset-password" | "totp-setup" | "totp-challenge" | "recovery-codes";

function persistSession(session_key: string, user: unknown) {
  localStorage.setItem("spiderx_session", session_key);
  localStorage.setItem("spiderx_user", JSON.stringify(user));
}

export default function LoginPage() {
  const router = useRouter();
  const [show, setShow] = React.useState(false);
  const [user, setUser] = React.useState("");
  const [pass, setPass] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
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
  const [pendingFinish, setPendingFinish] = React.useState<any>(null);

  // 2-minute challenge timeout (vehere-ui TwoFactorAuthPage)
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
    const res = await fetch("/api/v1/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Request failed");
    return json;
  }

  function finishOk(json: any) {
    if (json.session_key && json.user) {
      persistSession(json.session_key, json.user);
    }
    router.push(resolveLandingHref(json.user?.landingPage));
  }

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const json = await sessionPost({
        action: "login",
        user_id: user,
        user_pass: pass,
      });
      const next = String(json.next || "ok");
      setUserId(json.user_id || user);
      if (next === "ok") {
        finishOk(json);
        return;
      }
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
        const gen = await sessionPost({ action: "totp-setup-generate", user_id: json.user_id || user });
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
      setError("Password updated. Sign in again.");
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
        user_id: userId || user,
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
        user_id: userId || user,
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

  const title =
    step === "login"
      ? "Sign in"
      : step === "reset-password"
        ? "Reset password"
        : step === "totp-setup"
          ? "Set up authenticator"
          : step === "recovery-codes"
            ? "Save recovery codes"
            : useRecovery
              ? "Recovery code"
              : "Authenticator code";

  const subtitle =
    step === "login"
      ? "Vehere SpiderX console"
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
    <div className="grid min-h-screen lg:grid-cols-[0.9fr_1.1fr]">
      <section className="relative flex flex-col justify-between bg-black px-8 py-10 text-white lg:px-14">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary shadow-crimson">
            <Shield className="h-5 w-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight">SpiderX</span>
        </div>

        <div className="mx-auto w-full max-w-sm space-y-6 py-10">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-1 text-sm text-white/55">{subtitle}</p>
          </div>

          {error && (
            <p className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs text-primary-foreground">
              {error}
            </p>
          )}

          {step === "login" && (
            <form className="space-y-4" onSubmit={onLogin}>
              <div className="space-y-2">
                <Label className="text-white/70">Username</Label>
                <Input
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  className="border-white/15 bg-white/5 text-white"
                  autoComplete="username"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">Password</Label>
                <div className="relative">
                  <Input
                    type={show ? "text" : "password"}
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                    className="border-white/15 bg-white/5 pr-10 text-white"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50"
                    onClick={() => setShow((s) => !s)}
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full shadow-crimson" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          )}

          {step === "reset-password" && (
            <form className="space-y-4" onSubmit={onResetPassword}>
              <div className="space-y-2">
                <Label className="text-white/70">Current password</Label>
                <Input
                  type="password"
                  value={oldPass}
                  onChange={(e) => setOldPass(e.target.value)}
                  className="border-white/15 bg-white/5 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">New password</Label>
                <Input
                  type="password"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  className="border-white/15 bg-white/5 text-white"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">Confirm password</Label>
                <Input
                  type="password"
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  className="border-white/15 bg-white/5 text-white"
                  required
                />
              </div>
              <Button type="submit" className="w-full shadow-crimson" disabled={loading}>
                {loading ? "Saving…" : "Update password"}
              </Button>
              <Button type="button" variant="ghost" className="w-full text-white/60" onClick={() => setStep("login")}>
                Back to sign in
              </Button>
            </form>
          )}

          {step === "totp-setup" && (
            <form className="space-y-4" onSubmit={onTotpSetup}>
              {qrCodeUrl && (
                <div className="flex justify-center rounded-lg border border-white/15 bg-white p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrCodeUrl} alt="TOTP QR code" width={180} height={180} className="h-[180px] w-[180px]" />
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-white/70">Manual secret</Label>
                <Input
                  readOnly
                  value={totpSecret}
                  className="border-white/15 bg-white/5 font-mono text-xs text-white"
                  onFocus={(e) => e.currentTarget.select()}
                />
              </div>
              {otpauth && (
                <p className="break-all font-mono text-[10px] text-white/45">{otpauth}</p>
              )}
              <div className="space-y-2">
                <Label className="text-white/70">Authenticator code</Label>
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  className="border-white/15 bg-white/5 text-white"
                  required
                />
              </div>
              <Button type="submit" className="w-full shadow-crimson" disabled={loading || !totpCode}>
                {loading ? "Verifying…" : "Verify & continue"}
              </Button>
            </form>
          )}

          {step === "recovery-codes" && (
            <div className="space-y-4">
              <ul className="grid grid-cols-2 gap-2 rounded-md border border-white/15 bg-white/5 p-3 font-mono text-xs">
                {recoveryCodes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <Button
                type="button"
                variant="outline"
                className="w-full border-white/20 bg-transparent text-white"
                onClick={() => navigator.clipboard.writeText(recoveryCodes.join("\n"))}
              >
                Copy codes
              </Button>
              <Button
                type="button"
                className="w-full shadow-crimson"
                onClick={() => pendingFinish && finishOk(pendingFinish)}
              >
                I saved them — continue
              </Button>
            </div>
          )}

          {step === "totp-challenge" && (
            <form className="space-y-4" onSubmit={onTotpChallenge}>
              <div className="space-y-2">
                <Label className="text-white/70">{useRecovery ? "Recovery code" : "Authenticator code"}</Label>
                <Input
                  inputMode={useRecovery ? "text" : "numeric"}
                  autoComplete="one-time-code"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  className="border-white/15 bg-white/5 text-white"
                  required
                />
              </div>
              <Button type="submit" className="w-full shadow-crimson" disabled={loading || !totpCode}>
                {loading ? "Verifying…" : "Verify"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full text-white/60"
                onClick={() => {
                  setUseRecovery((v) => !v);
                  setTotpCode("");
                  setError(null);
                }}
              >
                {useRecovery ? "Use authenticator code" : "Use recovery code"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full text-white/60"
                onClick={() => {
                  setStep("login");
                  setTotpCode("");
                }}
              >
                Back to sign in
              </Button>
            </form>
          )}
        </div>

        <p className="text-[11px] text-white/35">© Vehere · SpiderX</p>
      </section>

      <section className="relative hidden overflow-hidden lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,hsl(354_86%_40%/0.35),transparent_50%),radial-gradient(ellipse_at_80%_80%,hsl(354_80%_30%/0.2),transparent_45%),#07070a]" />
        <div className="relative flex h-full flex-col justify-end p-14">
          <p className="max-w-md text-4xl font-semibold leading-tight tracking-tight text-white">
            SpiderX.
            <span className="block text-primary">Detect. Investigate. Act.</span>
          </p>
          <p className="mt-4 max-w-md text-sm text-white/55">
            Production console for Vehere link monitoring, targets, edge appliances, and health.
          </p>
        </div>
      </section>
    </div>
  );
}
