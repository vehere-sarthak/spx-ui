"use client";

import * as React from "react";
import type { Detection } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { relativeTime, cn } from "@/lib/utils";

export function DetectionStream({
  onSelect,
  selectedId,
  items = [],
  total,
  filterLabel,
  loading,
}: {
  onSelect: (d: Detection) => void;
  selectedId?: string;
  items?: Detection[];
  /** Matching documents in the whole window — the list itself is only the newest page. */
  total?: number;
  filterLabel?: string | null;
  loading?: boolean;
}) {
  const truncated = total != null && total > items.length;
  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Live Detection Stream</h2>
          <p className="text-[11px] text-muted-foreground">
            logvehere-alerts-*
            {filterLabel ? ` · ${filterLabel} only` : ""}
            {truncated ? ` · newest ${items.length} of ${total!.toLocaleString()}` : ""}
          </p>
        </div>
        <span className="flex items-center gap-1.5 text-[11px] text-severity-critical">
          <span className="sev-dot animate-pulse bg-severity-critical" />
          {loading ? "LOADING" : "LIVE"}
        </span>
      </div>
      <div className="scroll-thin flex-1 space-y-2 overflow-y-auto pr-1">
        {items.length === 0 && (
          <p className="py-8 text-center text-xs text-muted-foreground">
            {loading
              ? "Loading alerts…"
              : filterLabel
                ? `No ${filterLabel} detections in window`
                : "No detections in window"}
          </p>
        )}
        {items.map((d) => (
          <button
            key={d.id + String(d.ts)}
            onClick={() => onSelect(d)}
            className={cn(
              "animate-stream-in w-full rounded-lg border p-3 text-left transition-all hover:border-primary/40 hover:shadow-crimson",
              selectedId === d.id ? "border-primary/50 bg-primary/5 shadow-crimson" : "border-border/70 bg-card/50"
            )}
          >
            <div className="mb-1.5 flex items-center gap-2">
              <Badge variant={d.severity}>{d.severity}</Badge>
              <span className="truncate font-mono text-[10px] text-muted-foreground">{d.id}</span>
              <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                {d.ts ? relativeTime(d.ts) : ""}
              </span>
            </div>
            <div className="text-sm font-medium leading-snug">{d.title}</div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-muted-foreground">
              <span>
                {d.src} → {d.dst}
              </span>
              {d.protocol && d.protocol !== "-" && <span>{d.protocol}</span>}
              {d.alert_type && <span>{d.alert_type}</span>}
              {d.mitre && d.mitre !== "-" && <span>{d.mitre}</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
