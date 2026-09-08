"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId?: string;
  onEnrolled?: () => void;
};

/** Profile / forced MFA enrollment — mirrors vehere-ui EnrollTotpModal. */
export function EnrollTotpDialog({ open, onOpenChange, userId, onEnrolled }: Props) {
  const [secret, setSecret] = React.useState("");
  const [otpauth, setOtpauth] = React.useState("");
  const [qr, setQr] = React.useState("");
  const [token, setToken] = React.useState("");
  const [codes, setCodes] = React.useState<string[]>([]);
  const [step, setStep] = React.useState<"scan" | "codes">("scan");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setStep("scan");
      setToken("");
      setCodes([]);
      setError(null);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/v1/auth/session", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "totp-setup-generate", user_id: userId }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to generate secret");
        setSecret(json.secret || "");
        setOtpauth(json.otpauth || "");
        setQr(json.qrCodeUrl || "");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, userId]);

  async function verify() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/session", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "totp-setup-verify",
          user_id: userId,
          secret,
          token,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Invalid code");
      if (json.session_key && json.user) {
        localStorage.setItem("spiderx_session", json.session_key);
        localStorage.setItem("spiderx_user", JSON.stringify(json.user));
      }
      setCodes(json.recoveryCodes || []);
      setStep("codes");
      onEnrolled?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verify failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md space-y-4">
        <div>
          <h2 className="text-lg font-semibold">
            {step === "scan" ? "Enable authenticator (TOTP)" : "Recovery codes"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {step === "scan"
              ? "Scan the QR in Google Authenticator / Authy, then enter a code."
              : "Save these offline. Each code works once."}
          </p>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}

        {step === "scan" && (
          <>
            {qr && (
              <div className="flex justify-center rounded-md border bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="TOTP QR" width={160} height={160} />
              </div>
            )}
            <div className="space-y-1">
              <Label>Secret</Label>
              <Input readOnly value={secret} className="font-mono text-xs" />
            </div>
            {otpauth && <p className="break-all font-mono text-[10px] text-muted-foreground">{otpauth}</p>}
            <div className="space-y-1">
              <Label>Code</Label>
              <Input
                inputMode="numeric"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="6-digit code"
              />
            </div>
            <Button className="w-full" disabled={loading || !token} onClick={verify}>
              {loading ? "…" : "Verify & enable"}
            </Button>
          </>
        )}

        {step === "codes" && (
          <>
            <ul className="grid grid-cols-2 gap-2 rounded-md border p-3 font-mono text-xs">
              {codes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigator.clipboard.writeText(codes.join("\n"))}
            >
              Copy codes
            </Button>
            <Button className="w-full" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
