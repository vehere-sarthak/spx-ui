"use client";

import * as React from "react";
import { useSize } from "@/components/ndr/charts";
import { severityColor, type Severity } from "@/lib/types";
import { cn } from "@/lib/utils";

export type CadenceBucket = {
  t: string;
  total: number;
  /** Distinct target aliases hit in this bucket — breadth, not just volume. */
  subjects: number;
  priorities: Record<string, number>;
};

/** Stacked outward from the centre line, so critical anchors the bottom edge. */
const LAYER_ORDER: Severity[] = ["info", "low", "medium", "high", "critical"];

function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

function clockLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Cubic through the points, using midpoint control handles like SparkArea. */
function pathThrough(pts: { x: number; y: number }[], cmd: "M" | "L") {
  if (!pts.length) return "";
  let d = `${cmd} ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const q = pts[i - 1];
    const p = pts[i];
    const cx = (q.x + p.x) / 2;
    d += ` C ${cx} ${q.y}, ${cx} ${p.y}, ${p.x} ${p.y}`;
  }
  return d;
}

/**
 * Interception volume over the window as a centre-balanced streamgraph banded
 * by target priority. The counts are still the filter control, but the shape
 * shows *when* each band surged and how many distinct subjects were live.
 */
export function ThreatCadence({
  buckets = [],
  totals,
  active,
  onSelect,
  interval,
  loading,
}: {
  buckets?: CadenceBucket[];
  totals: { key: string; count: number }[];
  active?: string | null;
  onSelect?: (key: string) => void;
  interval?: string;
  loading?: boolean;
}) {
  const { ref, w } = useSize<HTMLDivElement>();
  const [hover, setHover] = React.useState<number | null>(null);
  const gid = React.useId().replace(/:/g, "");

  const totalMap = new Map(totals.map((t) => [t.key.toLowerCase(), t.count]));
  const layers = LAYER_ORDER.filter(
    (p) => (totalMap.get(p) || 0) > 0 || buckets.some((b) => (b.priorities[p] || 0) > 0)
  );
  const grandTotal = totals.reduce((a, t) => a + t.count, 0);

  const h = 96;
  const pad = { t: 10, r: 10, b: 16, l: 10 };
  const iw = Math.max(w - pad.l - pad.r, 1);
  const ih = Math.max(h - pad.t - pad.b, 1);
  const cy = pad.t + ih / 2;

  const maxTotal = Math.max(...buckets.map((b) => b.total), 1);
  const scale = ih / maxTotal;
  const xAt = (i: number) => pad.l + (i / Math.max(buckets.length - 1, 1)) * iw;

  // Each layer is the ribbon between its running offset and the next, with the
  // whole stack recentred per bucket so quiet periods pinch rather than drop.
  const bands = layers.map((sev) => {
    const top: { x: number; y: number }[] = [];
    const bottom: { x: number; y: number }[] = [];
    buckets.forEach((b, i) => {
      const x = xAt(i);
      let acc = 0;
      for (const other of layers) {
        if (other === sev) break;
        acc += b.priorities[other] || 0;
      }
      const y0 = cy - (b.total * scale) / 2;
      top.push({ x, y: y0 + acc * scale });
      bottom.push({ x, y: y0 + (acc + (b.priorities[sev] || 0)) * scale });
    });
    return {
      sev,
      d: `${pathThrough(top, "M")} ${pathThrough([...bottom].reverse(), "L")} Z`,
    };
  });

  const peakIdx = buckets.reduce((best, b, i) => (b.total > (buckets[best]?.total ?? -1) ? i : best), 0);
  const peak = buckets[peakIdx];
  const hovered = hover != null ? buckets[hover] : null;

  return (
    <div className="ndr-panel px-3 pb-2 pt-2.5">
      <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h3 className="mr-auto text-xs font-semibold uppercase tracking-wide">
          Interception Cadence
          {interval && (
            <span className="ml-2 font-mono text-[10px] font-normal normal-case tracking-normal text-muted-foreground">
              {interval} buckets
            </span>
          )}
        </h3>

        {layers.length === 0 && !loading && (
          <span className="text-[11px] text-muted-foreground">No priority aggregates from Elasticsearch</span>
        )}

        {[...layers].reverse().map((sev) => {
          const count = totalMap.get(sev) || 0;
          const share = grandTotal > 0 ? Math.round((count / grandTotal) * 100) : 0;
          const on = active === sev;
          return (
            <button
              key={sev}
              onClick={() => onSelect?.(sev)}
              title={`${count.toLocaleString()} ${sev} alerts · ${share}% of window — click to filter`}
              className={cn(
                "group flex items-center gap-2 rounded-md border px-2 py-1 transition",
                on ? "border-primary bg-primary/10 shadow-crimson" : "border-border/60 hover:border-primary/40",
                active && !on && "opacity-55"
              )}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                style={{ background: severityColor(sev), boxShadow: `0 0 8px ${severityColor(sev)}66` }}
              />
              <span className="text-[10px] font-semibold capitalize leading-none">{sev}</span>
              <span className="font-mono text-[11px] font-bold leading-none tabular-nums">{compact(count)}</span>
              <span className="font-mono text-[9px] leading-none text-muted-foreground">{share}%</span>
            </button>
          );
        })}
      </div>

      <div
        ref={ref}
        className="relative"
        style={{ height: h }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          if (!buckets.length || iw <= 1) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left - pad.l) / iw;
          const i = Math.round(ratio * Math.max(buckets.length - 1, 1));
          setHover(Math.min(buckets.length - 1, Math.max(0, i)));
        }}
      >
        {buckets.length < 2 ? (
          <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
            {loading ? "Loading cadence…" : "Not enough buckets in this window to draw a cadence"}
          </div>
        ) : (
          w > 0 && (
            <svg width={w} height={h} className="overflow-visible">
              <defs>
                <linearGradient id={`cad-scan-${gid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0" />
                  <stop offset="50%" stopColor="hsl(var(--primary))" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
                </linearGradient>
              </defs>

              <line
                x1={pad.l}
                x2={pad.l + iw}
                y1={cy}
                y2={cy}
                stroke="currentColor"
                className="text-border"
                strokeDasharray="2 6"
              />

              {bands.map((b) => (
                <path
                  key={b.sev}
                  d={b.d}
                  fill={severityColor(b.sev)}
                  stroke={severityColor(b.sev)}
                  strokeWidth={0.5}
                  opacity={active && active !== b.sev ? 0.18 : 0.82}
                  className="transition-opacity"
                />
              ))}

              {peak && peak.total > 0 && (
                <g pointerEvents="none">
                  <circle
                    cx={xAt(peakIdx)}
                    cy={cy - (peak.total * scale) / 2 - 5}
                    r={3}
                    fill="hsl(var(--primary))"
                  />
                  <text
                    x={Math.min(Math.max(xAt(peakIdx), pad.l + 22), pad.l + iw - 22)}
                    y={cy - (peak.total * scale) / 2 - 11}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[9px] font-medium"
                  >
                    peak {compact(peak.total)}
                  </text>
                </g>
              )}

              {hover != null && (
                <line
                  x1={xAt(hover)}
                  x2={xAt(hover)}
                  y1={pad.t - 4}
                  y2={pad.t + ih + 4}
                  stroke={`url(#cad-scan-${gid})`}
                  strokeWidth={1.5}
                  pointerEvents="none"
                />
              )}

              <text x={pad.l} y={h - 4} className="fill-muted-foreground text-[9px]">
                {clockLabel(buckets[0].t)}
              </text>
              <text x={pad.l + iw} y={h - 4} textAnchor="end" className="fill-muted-foreground text-[9px]">
                {clockLabel(buckets[buckets.length - 1].t)}
              </text>
            </svg>
          )
        )}

        {hovered && (
          <div
            className="pointer-events-none absolute top-0 z-10 min-w-[150px] -translate-x-1/2 rounded-md border border-border/80 bg-popover px-2.5 py-1.5 text-[10px] shadow-lg"
            style={{ left: Math.min(Math.max(xAt(hover!), 80), Math.max(w - 80, 80)) }}
          >
            <div className="mb-1 text-muted-foreground">{clockLabel(hovered.t)}</div>
            <div className="mb-1 flex items-baseline gap-1.5">
              <span className="font-mono text-sm font-bold tabular-nums">{hovered.total.toLocaleString()}</span>
              <span className="text-muted-foreground">
                alerts · {hovered.subjects.toLocaleString()} subjects live
              </span>
            </div>
            {[...layers].reverse().map((sev) => (
              <div key={sev} className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: severityColor(sev) }} />
                <span className="capitalize text-muted-foreground">{sev}</span>
                <span className="ml-auto font-mono tabular-nums">
                  {(hovered.priorities[sev] || 0).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
