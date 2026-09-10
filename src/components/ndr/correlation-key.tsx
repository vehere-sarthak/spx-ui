"use client";

import * as React from "react";
import { AlertTriangle, Radio, ScanSearch, UserRoundCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { bytes, compact, type FabricData } from "./interception-fabric";

/**
 * What SpiderX actually does, said once, in plain words, with this window's
 * live numbers in it.
 *
 * The console reads three separate measurements — how much traffic each line
 * carried, what matched the customer's watch list, and who those matches
 * turned out to be. Nothing on screen makes sense until the reader knows
 * those three are tied together by the line the traffic arrived on, so that
 * sentence is stated outright rather than left to be inferred from a chart.
 */
export function CorrelationKey({
  data,
  loading,
  className,
}: {
  data?: FabricData | null;
  loading?: boolean;
  className?: string;
}) {
  const t = data?.totals;
  const lines = t?.taps ?? 0;
  const degraded = t?.degraded ?? 0;

  const steps = [
    {
      icon: Radio,
      color: "hsl(199 89% 48%)",
      n: "1",
      title: "We measure every line",
      value: loading && !t ? "…" : bytes(t?.carried || 0),
      unit: `carried on ${lines} monitored line${lines === 1 ? "" : "s"}`,
    },
    {
      icon: ScanSearch,
      color: "#A855F7",
      n: "2",
      title: "We watch for your details",
      value: loading && !t ? "…" : compact(t?.matched || 0),
      unit: "times a watched detail appeared",
    },
    {
      icon: UserRoundCheck,
      color: "#10B981",
      n: "3",
      title: "We tell you who it was",
      value: loading && !t ? "…" : compact(t?.subjects || 0),
      unit: `people identified · ${compact(t?.surfaced || 0)} alerts`,
    },
  ];

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="mb-2 shrink-0">
        <h3 className="text-[12px] font-semibold">How SpiderX connects it</h3>
        <p className="text-[10px] leading-snug text-muted-foreground">
          Three separate measurements, tied together
        </p>
      </div>

      <ol className="scroll-thin min-h-0 flex-1 space-y-0 overflow-y-auto">
        {steps.map((s, i) => (
          <li key={s.n}>
            <div className="flex items-start gap-2">
              <span
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                style={{ background: `${s.color}22`, color: s.color }}
              >
                <s.icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold leading-tight">{s.title}</div>
                <div className="mt-0.5 flex items-baseline gap-1.5">
                  <span className="text-[15px] font-bold leading-none tabular-nums" style={{ color: s.color }}>
                    {s.value}
                  </span>
                </div>
                <div className="text-[9.5px] leading-snug text-muted-foreground">{s.unit}</div>
              </div>
            </div>
            {i < steps.length - 1 && (
              <div className="ml-3 h-3 w-px bg-border" aria-hidden />
            )}
          </li>
        ))}
      </ol>

      {/* The sentence the whole console rests on. */}
      <p className="mt-2 shrink-0 rounded-md border border-border/60 bg-muted/20 px-2.5 py-2 text-[10px] leading-snug text-muted-foreground">
        All three are matched up by <span className="font-semibold text-foreground">which line</span> the
        traffic came in on — so we can tell you not just that something happened, but{" "}
        <span className="font-semibold text-foreground">where</span> and{" "}
        <span className="font-semibold text-foreground">to whom</span>.
      </p>

      {degraded > 0 && (
        <p className="mt-2 flex shrink-0 items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[10px] leading-snug text-amber-500">
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
          <span>
            <span className="font-semibold">
              {degraded} line{degraded === 1 ? "" : "s"} need{degraded === 1 ? "s" : ""} attention.
            </span>{" "}
            Either traffic is flowing with nothing matching, or matches are arriving with no traffic
            reading. Click the line to see which.
          </span>
        </p>
      )}
    </div>
  );
}
