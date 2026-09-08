"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const COLORS = {
  grid: "hsl(var(--border))",
  muted: "hsl(var(--muted-foreground))",
  primary: "hsl(var(--primary))",
  card: "hsl(var(--card))",
};

export function useSize<T extends HTMLElement>() {
  const ref = React.useRef<T | null>(null);
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.max(0, Math.floor(width)), h: Math.max(0, Math.floor(height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, ...size };
}

function fmt(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return Number(n).toLocaleString();
}

function niceMax(max: number) {
  if (max <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(max)));
  const n = max / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * p;
}

/** Smooth area + line chart */
export function SparkArea({
  values,
  labels,
  className,
  color = COLORS.primary,
}: {
  values: number[];
  labels?: string[];
  className?: string;
  color?: string;
}) {
  const { ref, w, h } = useSize<HTMLDivElement>();
  const [hover, setHover] = React.useState<number | null>(null);
  const data = values.length ? values : [0];
  const pad = { t: 16, r: 12, b: 28, l: 44 };
  const max = niceMax(Math.max(...data, 0));
  const min = 0;
  const iw = Math.max(w - pad.l - pad.r, 1);
  const ih = Math.max(h - pad.t - pad.b, 1);
  const gid = React.useId().replace(/:/g, "");

  const pts = data.map((v, i) => {
    const x = pad.l + (i / Math.max(data.length - 1, 1)) * iw;
    const y = pad.t + ih - ((v - min) / (max - min || 1)) * ih;
    return { x, y, v };
  });

  const linePath = pts
    .map((p, i) => {
      if (i === 0) return `M ${p.x} ${p.y}`;
      const prev = pts[i - 1];
      const cx = (prev.x + p.x) / 2;
      return `C ${cx} ${prev.y}, ${cx} ${p.y}, ${p.x} ${p.y}`;
    })
    .join(" ");

  const areaPath = `${linePath} L ${pts[pts.length - 1]?.x ?? pad.l} ${pad.t + ih} L ${pad.l} ${pad.t + ih} Z`;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => max * t);

  return (
    <div ref={ref} className={cn("relative h-full w-full min-h-[160px]", className)} onMouseLeave={() => setHover(null)}>
      {w > 0 && (
        <svg width={w} height={h} className="overflow-visible">
          <defs>
            <linearGradient id={`ag-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.32} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {yTicks.map((t, i) => {
            const y = pad.t + ih - (t / max) * ih;
            return (
              <g key={i}>
                <line x1={pad.l} x2={pad.l + iw} y1={y} y2={y} stroke={COLORS.grid} strokeWidth={1} strokeDasharray={i === 0 ? undefined : "3 4"} opacity={0.7} />
                <text x={pad.l - 8} y={y + 3} textAnchor="end" fontSize={10} fill={COLORS.muted} fontFamily="ui-monospace, monospace">
                  {fmt(t)}
                </text>
              </g>
            );
          })}
          <path d={areaPath} fill={`url(#ag-${gid})`} />
          <path d={linePath} fill="none" stroke={color} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
          {pts.map((p, i) => (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <circle cx={p.x} cy={p.y} r={hover === i ? 5 : 0} fill={COLORS.card} stroke={color} strokeWidth={2} />
              <rect x={p.x - iw / data.length / 2} y={pad.t} width={Math.max(iw / data.length, 8)} height={ih} fill="transparent" />
            </g>
          ))}
          {labels?.length ? (
            <>
              <text x={pad.l} y={h - 8} fontSize={10} fill={COLORS.muted}>
                {labels[0]}
              </text>
              <text x={pad.l + iw} y={h - 8} textAnchor="end" fontSize={10} fill={COLORS.muted}>
                {labels[labels.length - 1]}
              </text>
            </>
          ) : null}
        </svg>
      )}
      {hover != null && pts[hover] && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-border/80 bg-popover px-2.5 py-1.5 text-[11px] shadow-lg"
          style={{ left: pts[hover].x, top: Math.max(4, pts[hover].y - 40) }}
        >
          <div className="text-muted-foreground">{labels?.[hover] || `Point ${hover + 1}`}</div>
          <div className="font-semibold tabular-nums text-foreground">{Number(data[hover]).toLocaleString()}</div>
        </div>
      )}
    </div>
  );
}

/** Horizontal ranked bars (preferred) or vertical columns */
export function MiniBars({
  data,
  className,
  horizontal = true,
  color = COLORS.primary,
}: {
  data: { label: string; value: number }[];
  className?: string;
  horizontal?: boolean;
  color?: string;
}) {
  // Must run before any early return — hook order has to be identical on every render.
  const { ref, w, h } = useSize<HTMLDivElement>();
  const max = Math.max(...data.map((d) => d.value), 1);
  if (!data.length) {
    return <p className="flex h-full items-center justify-center text-xs text-muted-foreground">No data</p>;
  }

  if (horizontal) {
    return (
      <div className={cn("flex h-full flex-col justify-center gap-2.5 py-1", className)}>
        {data.map((d, i) => {
          const pct = (d.value / max) * 100;
          return (
            <div key={`${d.label}-${i}`} className="group grid grid-cols-[88px_1fr_52px] items-center gap-2.5 text-[11px]">
              <span className="truncate text-right text-muted-foreground" title={d.label}>
                {d.label}
              </span>
              <div className="relative h-3 overflow-hidden rounded-sm bg-muted/70">
                <div
                  className="absolute inset-y-0 left-0 rounded-sm transition-all duration-500"
                  style={{
                    width: `${Math.max(pct, 1.5)}%`,
                    background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 65%, white))`,
                  }}
                />
              </div>
              <span className="text-right font-mono tabular-nums text-foreground/80">{fmt(d.value)}</span>
            </div>
          );
        })}
      </div>
    );
  }

  const pad = { t: 20, r: 8, b: 36, l: 8 };
  const iw = Math.max(w - pad.l - pad.r, 1);
  const ih = Math.max(h - pad.t - pad.b, 1);
  const gap = 6;
  const bw = Math.max((iw - gap * (data.length - 1)) / data.length, 8);

  return (
    <div ref={ref} className={cn("relative h-full w-full min-h-[160px]", className)}>
      {w > 0 && (
        <svg width={w} height={h}>
          {data.map((d, i) => {
            const bh = Math.max((d.value / max) * ih, 2);
            const x = pad.l + i * (bw + gap);
            const y = pad.t + ih - bh;
            return (
              <g key={`${d.label}-${i}`}>
                <title>{`${d.label}: ${d.value}`}</title>
                <rect x={x} y={y} width={bw} height={bh} rx={3} fill={color} opacity={0.9} />
                <text x={x + bw / 2} y={y - 6} textAnchor="middle" fontSize={9} fill={COLORS.muted} fontFamily="ui-monospace, monospace">
                  {fmt(d.value)}
                </text>
                <text x={x + bw / 2} y={h - 10} textAnchor="middle" fontSize={9} fill={COLORS.muted}>
                  {d.label.length > 8 ? `${d.label.slice(0, 7)}…` : d.label}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/** Donut with legend */
export function RingMix({
  slices,
  className,
}: {
  slices: { name: string; value: number; color: string }[];
  className?: string;
}) {
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  const [hover, setHover] = React.useState<string | null>(null);
  let acc = 0;
  const r = 42;
  const stroke = 14;
  const c = 2 * Math.PI * r;

  return (
    <div className={cn("flex h-full min-h-[160px] items-center gap-5", className)}>
      <div className="relative shrink-0">
        <svg width="132" height="132" viewBox="0 0 132 132">
          <g transform="translate(66,66) rotate(-90)">
            <circle r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} opacity={0.4} />
            {slices.map((s) => {
              const len = (s.value / total) * c;
              const el = (
                <circle
                  key={s.name}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={hover && hover !== s.name ? stroke - 2 : stroke}
                  strokeDasharray={`${len} ${c - len}`}
                  strokeDashoffset={-acc}
                  opacity={hover && hover !== s.name ? 0.35 : 1}
                  className="transition-all"
                  onMouseEnter={() => setHover(s.name)}
                  onMouseLeave={() => setHover(null)}
                  style={{ cursor: "pointer" }}
                />
              );
              acc += len;
              return el;
            })}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</div>
          <div className="text-base font-semibold tabular-nums">{fmt(total)}</div>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2 text-xs">
        {slices.map((s) => (
          <li
            key={s.name}
            className={cn(
              "flex items-center gap-2 rounded-md px-1.5 py-1 transition",
              hover === s.name && "bg-muted/60"
            )}
            onMouseEnter={() => setHover(s.name)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className="truncate">{s.name}</span>
            <span className="ml-auto font-mono tabular-nums text-muted-foreground">
              {fmt(s.value)}
              <span className="ml-1 text-[10px] opacity-70">({Math.round((s.value / total) * 100)}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Consistent chart card shell */
export function ChartPanel({
  title,
  children,
  className,
  height = "h-56",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  height?: string;
}) {
  return (
    <div className={cn("flex flex-col overflow-hidden rounded-lg border border-border/70 bg-card", className)}>
      <div className="flex items-center border-b border-border/50 px-3 py-2">
        <h3 className="text-xs font-semibold tracking-wide text-foreground/90">{title}</h3>
      </div>
      <div className={cn("min-h-0 flex-1 px-3 py-2", height)}>{children}</div>
    </div>
  );
}
