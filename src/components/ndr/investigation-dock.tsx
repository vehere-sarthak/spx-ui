"use client";

import * as React from "react";
import { Crosshair, Flag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { Detection } from "@/lib/types";
import { formatBytes, relativeTime } from "@/lib/utils";

export function InvestigationDock({
  detection,
}: {
  detection: Detection | null;
  /** Reserved for callers that surface recon under the dock */
  recon?: unknown;
}) {
  if (!detection) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-primary/40 text-primary">
          <Crosshair className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium">Investigation Dock</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Select a detection from Elasticsearch to inspect fields.
          </p>
        </div>
      </div>
    );
  }

  const fields: { label: string; value?: string | number | null; mono?: boolean }[] = [
    { label: "Value", value: detection.value || detection.src, mono: true },
    { label: "Link", value: detection.link_name || detection.dst, mono: true },
    { label: "Probe", value: detection.probe_host_name || detection.host },
    { label: "Probe IP", value: detection.probe_ip, mono: true },
    { label: "Type", value: detection.protocol },
    { label: "Alert type", value: detection.alert_type },
    { label: "Priority", value: detection.severity },
    {
      label: "MITRE",
      value: detection.mitre && detection.mitre !== "-" ? detection.mitre : undefined,
      mono: true,
    },
    {
      label: "Hit count",
      value: detection.hit_count != null ? detection.hit_count.toLocaleString() : undefined,
    },
    { label: "Bytes", value: detection.bytes ? formatBytes(detection.bytes) : undefined },
    { label: "Timestamp", value: detection.ts ? relativeTime(detection.ts) : undefined },
    { label: "Session", value: detection.session_id, mono: true },
    { label: "Document id", value: detection.id, mono: true },
  ].filter((f) => f.value != null && String(f.value).trim() !== "" && String(f.value) !== "-");

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Badge variant={detection.severity}>{detection.severity}</Badge>
              {detection.alert_type && <Badge variant="secondary">{detection.alert_type}</Badge>}
              {detection.flagged && (
                <Badge variant="secondary" className="gap-1">
                  <Flag className="h-3 w-3" />
                  Flagged
                </Badge>
              )}
            </div>
            <h3 className="text-base font-semibold leading-snug">{detection.title}</h3>
            {!!detection.tags?.length && (
              <div className="mt-2 flex flex-wrap gap-1">
                {detection.tags.map((t) => (
                  <Badge key={t.name} variant="outline" className="text-[10px]">
                    {t.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          {fields.map((f) => (
            <Meta key={f.label} label={f.label} value={String(f.value)} mono={f.mono} />
          ))}
        </div>
      </div>

      <Separator />

      <div className="flex-1 overflow-y-auto p-4 scroll-thin">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Source document fields
        </p>
        <div className="space-y-1 font-mono text-[10px] text-muted-foreground">
          {fields.map((f) => (
            <div key={f.label} className="ndr-inset flex justify-between gap-2 p-2">
              <span>{f.label}</span>
              <span className="truncate text-foreground">{String(f.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="ndr-inset p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={mono ? "mt-0.5 truncate font-mono text-[11px]" : "mt-0.5 truncate text-[11px] font-medium"}>
        {value}
      </div>
    </div>
  );
}
