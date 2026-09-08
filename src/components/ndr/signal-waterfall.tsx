"use client";

import * as React from "react";
import { Radio } from "lucide-react";
import { severityColor } from "@/lib/types";
import { cn } from "@/lib/utils";

export type WaterfallRow = {
  /** Stable row key — a target alias, or a protocol name. */
  key: string;
  /** Primary label shown on the row. */
  label: string;
  /** Optional second line: the subject a target is filed under, say. */
  sublabel?: string;
  /** Colour family for the row's cells. */
  tone: "encap" | "protocol" | string;
  total: number;
  /** One count per time bucket, aligned to `buckets`. */
  values: number[];
  /** Tooltip-only extras, rendered as `· ` separated text. */
  meta?: string;
};

function compact(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}G`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

function clockLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * Cell colour. Wire rows keep the cool/hot split that separates encapsulations
 * from protocols; subject rows are tinted by the target's own priority, so a
 * high-priority subject reads hot without needing a legend.
 */
function cellColor(tone: WaterfallRow["tone"], t: number) {
  if (t <= 0) return "transparent";
  const e = Math.min(1, Math.max(0, t));
  if (tone === "encap") return `hsl(${205 - 25 * e} 90% ${16 + 42 * e}% / ${0.25 + 0.75 * e})`;
  if (tone === "protocol") return `hsl(${45 - 45 * e} 92% ${20 + 38 * e}% / ${0.25 + 0.75 * e})`;
  // Severity-toned rows: same hue throughout, intensity carries the volume.
  return `color-mix(in srgb, ${severityColor(tone)} ${Math.round(18 + 82 * e)}%, transparent)`;
}

/**
 * Intensity for one cell, 0-1.
 *
 * Row mode is linear-with-gamma against the row's own peak: counters sit within
 * one order of magnitude of each other bucket to bucket, and a log curve pins
 * every one of them near full brightness. Global mode is the opposite problem —
 * ETH outruns NTP by five orders — so there log is the honest ramp.
 */
function intensity(v: number, denom: number, mode: "row" | "global") {
  if (v <= 0 || denom <= 0) return 0;
  if (mode === "global") return Math.log10(v + 1) / (Math.log10(denom + 1) || 1);
  return Math.pow(Math.min(1, v / denom), 0.6);
}

/**
 * Time-vs-signal waterfall — an RF-style spectrogram. Used for the subjects a
 * probe is actually hitting and, on the wire tab, for the protocol counters
 * underneath them.
 */
export function SignalWaterfall({
  buckets = [],
  rows = [],
  interval,
  loading,
  maxRows = 22,
  unit = "hits",
  emptyLabel = "No signal in this window",
  selectedKey,
  onSelect,
  legend,
}: {
  buckets?: string[];
  rows?: WaterfallRow[];
  interval?: string;
  loading?: boolean;
  maxRows?: number;
  unit?: string;
  emptyLabel?: string;
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
  legend?: React.ReactNode;
}) {
  const [scale, setScale] = React.useState<"row" | "global">("row");
  const [hover, setHover] = React.useState<{ row: string; col: number } | null>(null);

  const shown = rows.slice(0, maxRows);
  const globalMax = Math.max(...rows.flatMap((r) => r.values), 1);
  const hoveredRow = hover ? shown.find((r) => r.key === hover.row) : null;

  if (!shown.length || !buckets.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground">
        <Radio className="h-5 w-5 opacity-50" />
        {loading ? "Scanning…" : emptyLabel}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-1.5 flex h-4 shrink-0 items-center gap-2 text-[10px]">
        {hoveredRow && hover ? (
          <span className="truncate font-mono tabular-nums text-foreground">
            <span className="font-semibold">{hoveredRow.label}</span>
            <span className="text-muted-foreground"> · {clockLabel(buckets[hover.col])} · </span>
            {(hoveredRow.values[hover.col] || 0).toLocaleString()} {unit}
          </span>
        ) : (
          <>
            {legend}
            <span className="ml-auto shrink-0 text-muted-foreground">
              {shown.length} of {rows.length}
              {interval ? ` · ${interval}` : ""}
            </span>
            <div className="flex shrink-0 rounded border border-border/60 p-0.5">
              {(["row", "global"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setScale(mode)}
                  title={
                    mode === "row"
                      ? "Scale each row to its own peak — reveals per-row rhythm"
                      : "Scale all rows to the loudest — reveals absolute dominance"
                  }
                  className={cn(
                    "rounded px-1 text-[9px] capitalize transition",
                    scale === mode
                      ? "bg-primary/15 font-semibold text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {mode}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto pr-1" onMouseLeave={() => setHover(null)}>
        <div className="space-y-[3px]">
          {shown.map((row) => {
            const denom = scale === "row" ? Math.max(...row.values, 1) : globalMax;
            const active = selectedKey === row.key;
            return (
              <div
                key={row.key}
                onClick={() => onSelect?.(row.key)}
                className={cn(
                  "grid grid-cols-[92px_1fr_46px] items-center gap-1.5 rounded-sm transition-colors",
                  onSelect && "cursor-pointer",
                  active ? "bg-primary/10 ring-1 ring-primary/40" : hover?.row === row.key && "bg-muted/40"
                )}
              >
                <span
                  className="min-w-0 text-right"
                  title={[row.label, row.sublabel, row.meta, `${row.total.toLocaleString()} ${unit}`]
                    .filter(Boolean)
                    .join(" · ")}
                >
                  <span className="block truncate font-mono text-[10px] text-foreground/80">{row.label}</span>
                  {row.sublabel && (
                    <span className="block truncate text-[9px] leading-tight text-muted-foreground">
                      {row.sublabel}
                    </span>
                  )}
                </span>
                <div className="flex h-[11px] gap-px overflow-hidden rounded-sm bg-muted/30">
                  {row.values.map((v, i) => (
                    <div
                      key={i}
                      className="h-full flex-1 transition-colors"
                      style={{ background: cellColor(row.tone, intensity(v, denom, scale)) }}
                      onMouseEnter={() => setHover({ row: row.key, col: i })}
                      title={`${row.label} · ${clockLabel(buckets[i])} · ${v.toLocaleString()} ${unit}`}
                    />
                  ))}
                </div>
                <span className="text-right font-mono text-[10px] tabular-nums text-foreground/70">
                  {compact(row.total)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-1.5 grid shrink-0 grid-cols-[92px_1fr_46px] gap-1.5 text-[9px] text-muted-foreground">
        <span />
        <span className="flex justify-between">
          <span>{clockLabel(buckets[0])}</span>
          <span>{clockLabel(buckets[buckets.length - 1])}</span>
        </span>
        <span />
      </div>
    </div>
  );
}

/** Shared swatch legend for the wire tab's two colour families. */
export function WireLegend() {
  return (
    <>
      {(["encap", "protocol"] as const).map((tone) => (
        <span key={tone} className="flex items-center gap-1 text-muted-foreground">
          <span
            className="h-2 w-6 rounded-sm"
            style={{ background: `linear-gradient(90deg, ${cellColor(tone, 0.12)}, ${cellColor(tone, 1)})` }}
          />
          {tone}
        </span>
      ))}
    </>
  );
}
