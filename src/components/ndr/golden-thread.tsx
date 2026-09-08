"use client";

import * as React from "react";
import { Antenna, Database, Filter, Radar, Server, UserRoundSearch, Waves } from "lucide-react";
import { cn, relativeTime } from "@/lib/utils";

export type ThreadHop = {
  id: string;
  step: number;
  label: string;
  detail: string;
  value: number;
  sub: string;
  /** Present on hops whose freshness matters more than their count. */
  ts?: string | null;
  stale?: boolean;
};

const HOP_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  target: UserRoundSearch,
  filter: Filter,
  probe: Antenna,
  wire: Waves,
  edge: Server,
  cms: Database,
  console: Radar,
};

function compact(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return n.toLocaleString();
}

/**
 * The seven hops a target takes from the analyst's keyboard to the analyst's
 * screen — saved, filtered, pulled by the agent, matched on the wire, written
 * on the edge, indexed on the CMS, surfaced by name. Each hop shows the live
 * number that proves it is moving, so a break in the chain is visible as the
 * place the numbers stop.
 */
export function GoldenThread({ hops = [], loading }: { hops?: ThreadHop[]; loading?: boolean }) {
  if (!hops.length) {
    return (
      <div className="ndr-panel px-3 py-4 text-xs text-muted-foreground">
        {loading ? "Tracing the golden thread…" : "No pipeline telemetry from Elasticsearch"}
      </div>
    );
  }

  return (
    <div className="ndr-panel px-3 pb-2.5 pt-2">
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide">The Golden Thread</h3>
        <p className="truncate text-[10px] text-muted-foreground">
          analyst saves a target → probe matches on the wire → the analyst sees their own subject, by name
        </p>
      </div>

      <ol className="scroll-thin flex items-stretch gap-0 overflow-x-auto pb-1">
        {hops.map((hop, i) => {
          const Icon = HOP_ICON[hop.id] || Radar;
          const last = i === hops.length - 1;
          return (
            <li key={hop.id} className="flex min-w-0 flex-1 items-stretch">
              <div
                className={cn(
                  "group relative min-w-[128px] flex-1 rounded-md border px-2.5 py-2 transition",
                  hop.stale
                    ? "border-border/50 bg-muted/20 opacity-70"
                    : last
                      ? "border-primary/50 bg-primary/10"
                      : "border-border/60 bg-card/40"
                )}
                title={`Step ${hop.step} · ${hop.label} · ${hop.detail} · ${hop.value.toLocaleString()}`}
              >
                <div className="mb-1 flex items-center gap-1.5">
                  <Icon
                    className={cn("h-3.5 w-3.5 shrink-0", last ? "text-primary" : "text-muted-foreground")}
                  />
                  <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {hop.step} · {hop.label}
                  </span>
                </div>
                <div className="font-mono text-lg font-bold leading-none tabular-nums">
                  {loading && hop.value === 0 ? "…" : compact(hop.value)}
                </div>
                <div className="mt-1 truncate text-[10px] text-muted-foreground">
                  {hop.ts ? `last write ${relativeTime(hop.ts)}` : hop.sub}
                </div>
                <div className="mt-1 truncate font-mono text-[9px] text-muted-foreground/70">
                  {hop.detail}
                </div>
              </div>

              {!last && (
                <div className="flex w-4 shrink-0 items-center justify-center" aria-hidden>
                  <span
                    className={cn(
                      "h-px w-full",
                      hop.stale ? "bg-border" : "bg-gradient-to-r from-border to-primary/60"
                    )}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
