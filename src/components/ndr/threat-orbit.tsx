"use client";

import { severityColor, type Severity } from "@/lib/types";
import { cn } from "@/lib/utils";

export type OrbitNode = {
  id: string;
  label: string;
  /** Alert count for this node — drives both radius and dot size. */
  count: number;
  severity: Severity | string;
};

const R_IN = 62;
const R_OUT = 118;

function compactCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

export function ThreatOrbit({
  selected,
  onSelect,
  className,
  nodes = [],
}: {
  selected?: string;
  onSelect?: (id: string) => void;
  className?: string;
  nodes?: OrbitNode[];
}) {
  const size = 360;
  const cx = size / 2;
  const cy = size / 2;

  if (nodes.length === 0) {
    return (
      <div className={cn("flex aspect-square w-full max-w-[360px] items-center justify-center text-xs text-muted-foreground", className)}>
        No subjects matched in this window
      </div>
    );
  }

  // Volume is log-scaled onto the radius, inverted so the busiest subject sits
  // closest to the core. Dot area carries the same number linearly-ish (sqrt of
  // the radius), so a big outer dot can't be mistaken for a small inner one.
  const counts = nodes.map((n) => Math.max(0, n.count));
  const max = Math.max(...counts);
  const min = Math.min(...counts);
  const lo = Math.log10(min + 1);
  const hi = Math.log10(max + 1);
  const span = hi - lo;
  const midR = (R_IN + R_OUT) / 2;

  const radiusFor = (c: number) =>
    span <= 0 ? midR : R_OUT - ((Math.log10(Math.max(0, c) + 1) - lo) / span) * (R_OUT - R_IN);
  const countAt = (r: number) => Math.round(10 ** (lo + ((R_OUT - r) / (R_OUT - R_IN)) * span) - 1);
  const dotFor = (c: number) => (max <= 0 ? 4.5 : 4.5 + 8.5 * Math.sqrt(Math.max(0, c) / max));

  // Evenly spaced, offset half a step so no node sits under the ring tick labels at 12 o'clock.
  const step = 360 / nodes.length;
  const placed = nodes.map((n, i) => {
    const r = radiusFor(n.count);
    const rad = ((-90 + step / 2 + i * step) * Math.PI) / 180;
    return { ...n, r, x: cx + Math.cos(rad) * r, y: cy + Math.sin(rad) * r, dot: dotFor(n.count) };
  });

  const ticks = span > 0 ? [R_IN, midR, R_OUT] : [midR];
  const seenTickLabels = new Set<string>();

  return (
    <div className={cn("relative mx-auto w-full max-w-[300px]", className)}>
      <svg viewBox={`0 0 ${size} ${size}`} className="aspect-square h-auto w-full">
        <defs>
          <radialGradient id="orbitGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(354 86% 54%)" stopOpacity="0.22" />
            <stop offset="70%" stopColor="hsl(354 86% 54%)" stopOpacity="0.04" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={126} fill="url(#orbitGlow)" />

        {ticks.map((r) => (
          <g key={r}>
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke="currentColor"
              className="text-border"
              strokeWidth={1}
              strokeDasharray="3 6"
            />
            {(() => {
              const label = compactCount(countAt(r));
              if (seenTickLabels.has(label)) return null;
              seenTickLabels.add(label);
              return (
                <text
                  x={cx}
                  // Inside the ring, so the outermost label never crowds
                  // whatever sits directly above the chart.
                  y={cy - r + 9}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[8px] font-medium"
                >
                  {label}
                </text>
              );
            })()}
          </g>
        ))}

        <circle cx={cx} cy={cy} r={16} fill="hsl(var(--primary))" opacity={0.9} />
        <circle
          cx={cx}
          cy={cy}
          r={23}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={1}
          opacity={0.4}
          className="animate-pulse-ring origin-center"
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        />
        <text x={cx} y={cy + 4} textAnchor="middle" className="fill-white text-[9px] font-semibold">
          NDR
        </text>

        {placed.map((n) => {
          const active = selected === n.id;
          return (
            <g key={n.id} className="cursor-pointer" onClick={() => onSelect?.(n.id)}>
              <title>{`${n.label} · ${n.count.toLocaleString()} alerts · ${n.severity}`}</title>
              <line
                x1={cx}
                y1={cy}
                x2={n.x}
                y2={n.y}
                stroke={severityColor((n.severity as Severity) || "info")}
                strokeWidth={active ? 1.25 : 0.75}
                opacity={active ? 0.55 : 0.18}
              />
              <circle
                cx={n.x}
                cy={n.y}
                r={n.dot}
                fill={severityColor((n.severity as Severity) || "info")}
                opacity={0.95}
                stroke={active ? "#fff" : "transparent"}
                strokeWidth={2}
              />
              <text
                x={n.x}
                y={n.y + n.dot + 10}
                textAnchor="middle"
                className="fill-foreground text-[8px] font-medium"
              >
                {n.label}
              </text>
              <text
                x={n.x}
                y={n.y + n.dot + 18}
                textAnchor="middle"
                className="fill-muted-foreground text-[8px] font-mono"
              >
                {compactCount(n.count)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
