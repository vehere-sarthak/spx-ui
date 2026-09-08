"use client";

import * as React from "react";
import { CalendarClock, Crosshair, ShieldCheck, ShieldOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { Detection, Severity } from "@/lib/types";
import { relativeTime } from "@/lib/utils";

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="ndr-inset px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`truncate text-xs ${mono ? "font-mono" : ""}`} title={typeof value === "string" ? value : undefined}>
        {value}
      </div>
    </div>
  );
}

/** Days left on the interception authority, or null when there is no bound. */
function daysLeft(validTill?: string) {
  if (!validTill) return null;
  const t = Date.parse(validTill);
  if (Number.isNaN(t)) return null;
  return Math.round((t - Date.now()) / 86_400_000);
}

/**
 * Identity-first detail panel: who the subject is, under whose authority they
 * are being intercepted, and how long that authority has left — the raw
 * document fields sit underneath, not on top.
 */
export function TargetDossier({ detection }: { detection: Detection | null }) {
  if (!detection) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-primary/40 text-primary">
          <Crosshair className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium">Target Dossier</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Pick a subject from the waterfall or the orbit to open their file.
          </p>
        </div>
      </div>
    );
  }

  const t = detection.target;
  const name = [t?.firstName, t?.lastName].filter(Boolean).join(" ");
  const subject = t?.subject?.join(", ");
  const left = daysLeft(t?.validTill);
  const lapsed = left != null && left < 0;
  const priority = (t?.priority || detection.severity || "info").toLowerCase() as Severity;

  return (
    <div className="scroll-thin flex h-full flex-col overflow-y-auto">
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <Badge variant={priority}>{priority}</Badge>
              {t?.enabled === false && <Badge variant="secondary">disabled</Badge>}
              {detection.alert_type && <Badge variant="secondary">{detection.alert_type}</Badge>}
            </div>
            <h2 className="truncate text-base font-semibold" title={t?.alias || detection.title}>
              {t?.alias || detection.title}
            </h2>
            <p className="truncate text-[11px] text-muted-foreground">
              {name || detection.value || "—"}
              {subject ? ` · ${subject}` : ""}
            </p>
          </div>
          <span className="shrink-0 text-right text-[10px] text-muted-foreground">
            {detection.ts ? relativeTime(detection.ts) : ""}
          </span>
        </div>

        {t?.description && (
          <p className="text-[11px] leading-snug text-muted-foreground">{t.description}</p>
        )}

        {/* Authority window — the one field that turns a hit into a legal question. */}
        {(t?.activeFrom || t?.validTill) && (
          <div
            className={`flex items-center gap-2 rounded-md border px-2.5 py-2 ${
              lapsed
                ? "border-primary/50 bg-primary/10 text-primary"
                : left != null && left <= 1
                  ? "border-severity-medium/50 bg-severity-medium/10"
                  : "border-border/60 bg-muted/30"
            }`}
          >
            {lapsed ? <ShieldOff className="h-4 w-4 shrink-0" /> : <ShieldCheck className="h-4 w-4 shrink-0" />}
            <div className="min-w-0 text-[11px]">
              <div className="font-medium">
                {lapsed
                  ? `Authority lapsed ${Math.abs(left!)}d ago`
                  : left != null
                    ? `${left}d of authority left`
                    : "Authority window"}
              </div>
              <div className="truncate text-[10px] text-muted-foreground">
                {t?.activeFrom ? new Date(t.activeFrom).toLocaleDateString() : "—"} →{" "}
                {t?.validTill ? new Date(t.validTill).toLocaleDateString() : "—"}
              </div>
            </div>
            <CalendarClock className="ml-auto h-3.5 w-3.5 shrink-0 opacity-50" />
          </div>
        )}

        <div className="grid grid-cols-2 gap-1.5">
          <Field label="Matched value" value={detection.value || detection.src} mono />
          <Field label="Link" value={detection.link_name || detection.dst} mono />
          <Field label="Probe" value={detection.probe_host_name || detection.host} />
          <Field label="Match type" value={detection.protocol} />
          {t?.targetValue?.length ? (
            <Field label="Watched selectors" value={t.targetValue.join(", ")} mono />
          ) : null}
          {t?.captureAction?.length ? (
            <Field label="Capture action" value={t.captureAction.join(" · ")} />
          ) : null}
          {t?.createdBy && <Field label="Created by" value={t.createdBy} />}
          {t?.lastModifiedBy && <Field label="Modified by" value={t.lastModifiedBy} />}
          {t?.importName && <Field label="Import batch" value={t.importName} mono />}
          {detection.hit_count ? (
            <Field label="Hit count" value={detection.hit_count.toLocaleString()} mono />
          ) : null}
        </div>
      </div>

      <Separator />

      <div className="space-y-1.5 p-4">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Alert document
        </h3>
        <dl className="space-y-1 text-[11px]">
          {[
            ["Alert name", detection.title],
            ["Priority", detection.severity],
            ["Probe IP", detection.probe_ip],
            ["Session", detection.session_id],
            ["Index", detection.index],
            ["Document id", detection.id],
          ]
            .filter(([, v]) => v != null && String(v).trim() !== "" && String(v) !== "-")
            .map(([k, v]) => (
              <div key={String(k)} className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 text-muted-foreground">{k}</dt>
                <dd className="truncate font-mono text-foreground/80" title={String(v)}>
                  {String(v)}
                </dd>
              </div>
            ))}
        </dl>
      </div>
    </div>
  );
}
