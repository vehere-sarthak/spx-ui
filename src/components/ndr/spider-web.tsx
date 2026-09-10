"use client";

import * as React from "react";
import { severityColor, type Severity } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  bytes,
  compact,
  STATE_META,
  type FabricData,
  type FabricLink,
  type FabricSubject,
  type FlowSelection,
} from "./interception-fabric";

/* ── the web's geometry ───────────────────────────────────────────────────
 * Radius is the pipeline. The rim is the wire, the capture ring is where
 * SpiderX matches, and the hub is SpiderX itself — so a strand running from
 * the outside in *is* a packet's journey through the product.
 */
const VB_W = 620;
const VB_H = 472;
const CX = 310;
const CY = 234;

const R_HUB = 30;
const R_MATCH = 100;
const R_RIM = 168;

const WIRE = "hsl(199 89% 48%)";
const MATCH = "#A855F7";

const RAD = Math.PI / 180;

/** Angles run clockwise from 12 o'clock, the way the rim labels read. */
function polar(r: number, deg: number): [number, number] {
  const a = (deg - 90) * RAD;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

function unit(deg: number): [number, number] {
  const a = (deg - 90) * RAD;
  return [Math.cos(a), Math.sin(a)];
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/**
 * One capture thread. Real orb-web spiral threads sag between the radii they
 * are strung across, and that sag is most of what makes a web read as a web
 * rather than as a set of concentric circles.
 */
function ringPath(r: number, angles: number[], sag = 0.045) {
  if (angles.length < 2) return "";
  const [sx, sy] = polar(r, angles[0]);
  let d = `M${sx.toFixed(1)},${sy.toFixed(1)}`;
  for (let i = 0; i < angles.length; i++) {
    const a1 = angles[i];
    const raw = angles[(i + 1) % angles.length];
    const a2 = raw < a1 ? raw + 360 : raw;
    const [qx, qy] = polar(r * (1 - sag * 2), (a1 + a2) / 2);
    const [px, py] = polar(r, a2);
    d += ` Q${qx.toFixed(1)},${qy.toFixed(1)} ${px.toFixed(1)},${py.toFixed(1)}`;
  }
  return `${d}Z`;
}

/**
 * A tap's strand, drawn as a taper down the radius: wide at the rim where the
 * wire hands over bytes, narrower at the capture ring where the selectors
 * matched, thinnest at the hub where alerts reach the analyst. Any stage that
 * produced nothing pinches the thread to zero width, so a tap carrying traffic
 * that matches nothing visibly *stops* partway in.
 */
function strandPath(angle: number, wRim: number, wMatch: number, wHub: number) {
  const [ux, uy] = unit(angle + 90);
  const at = (r: number, w: number, sign: 1 | -1): string => {
    const [px, py] = polar(r, angle);
    return `${(px + ux * w * sign).toFixed(1)},${(py + uy * w * sign).toFixed(1)}`;
  };
  return [
    `M${at(R_RIM, wRim, 1)}`,
    `L${at(R_MATCH, wMatch, 1)}`,
    `L${at(R_HUB, wHub, 1)}`,
    `L${at(R_HUB, wHub, -1)}`,
    `L${at(R_MATCH, wMatch, -1)}`,
    `L${at(R_RIM, wRim, -1)}`,
    "Z",
  ].join(" ");
}

/**
 * The stretch of a strand that actually carries something, and how fast the
 * flow along it should run.
 *
 * A live tap flows the whole way, rim to hub. A tap that carried traffic but
 * matched nothing flows only as far as the ring, where its thread parts; one
 * reporting matches with no link-stats behind it has nothing to flow from the
 * rim, so it starts at the ring. A silent tap gets no flow at all.
 */
function flowSegment(l: FabricLink, angle: number, maxBytes: number) {
  if (l.state === "silent") return null;
  const [x1, y1] = polar(l.bytes === 0 ? R_MATCH : R_RIM, angle);
  const [x2, y2] = polar(l.hits === 0 ? R_MATCH : R_HUB, angle);
  // Busier taps run faster: 3.2s at a trickle down to 1.3s at the peak.
  const duration = (3.2 - 1.9 * Math.min(1, l.bytes / maxBytes)).toFixed(2);
  return { x1, y1, x2, y2, duration };
}

/**
 * The SpiderX Web.
 *
 * The product's own shape, drawn as the animal it is named after. Traffic
 * arrives on the rim, where every tap anchors a strand; each strand carries
 * that tap's volume inward and tapers as SpiderX filters it — wide with bytes
 * at the wire, narrower with selector matches at the capture ring, thinnest
 * with the alerts that survive. At the hub sits SpiderX. Around it, in the
 * capture band, hang the subjects it identified, each tethered by a silk
 * thread back to the engine that named it — the busier the subject, the closer
 * it has been drawn in.
 *
 * Every number comes from the same three-way join as the fabric view
 * (link-stats ⋈ soi-stats ⋈ logvehere-alerts, on `link_name`); this is the
 * same truth told as anatomy instead of as columns.
 */
export function SpiderWeb({
  data,
  loading,
  selected,
  onSelect,
  className,
}: {
  data?: FabricData | null;
  loading?: boolean;
  selected?: FlowSelection | null;
  onSelect?: (s: FlowSelection) => void;
  className?: string;
}) {
  const [focus, setFocus] = React.useState<{ kind: "tap" | "prey"; key: string } | null>(null);

  const links = React.useMemo(() => (data?.links || []).slice(0, 10), [data]);
  const subjects = React.useMemo(() => (data?.subjects || []).slice(0, 8), [data]);
  const linkSubject = React.useMemo(() => data?.edges?.linkSubject || [], [data]);
  const totals = data?.totals;

  // Radii: one per tap, padded with structural threads so the web still looks
  // spun when only a couple of taps are live.
  const web = React.useMemo(() => {
    const n = Math.max(1, links.length);
    const per = Math.max(2, Math.ceil(14 / n));
    const count = n * per;
    const step = 360 / count;
    const angles = Array.from({ length: count }, (_, i) => i * step);
    const tapAngle = new Map<string, number>();
    links.forEach((l, i) => tapAngle.set(l.key, i * per * step));

    const first = R_HUB + 20;
    const rings = Array.from({ length: 7 }, (_, k) => first + ((R_RIM - first) * k) / 6);
    return { angles, tapAngle, rings };
  }, [links]);

  const maxBytes = React.useMemo(() => Math.max(1, ...links.map((l) => l.bytes)), [links]);

  const scale = React.useMemo(() => {
    const maxHits = Math.max(1, ...links.map((l) => l.hits));
    const maxAlerts = Math.max(1, ...links.map((l) => l.alerts));
    return {
      rim: (l: FabricLink) => (l.bytes > 0 ? 2 + 5 * (l.bytes / maxBytes) : 0),
      match: (l: FabricLink) => (l.hits > 0 ? 0.9 + 2.3 * (l.hits / maxHits) : 0),
      hub: (l: FabricLink) => (l.alerts > 0 ? 0.35 + 0.85 * (l.alerts / maxAlerts) : 0),
    };
  }, [links, maxBytes]);

  // Prey hang between the capture ring and the rim, offset half a step off the
  // tap radii so they sit *on* the spiral rather than on a strand. Volume pulls
  // them inward: the subject the web is working hardest on sits nearest SpiderX.
  const prey = React.useMemo(() => {
    const m = subjects.length;
    if (!m) return [] as { s: FabricSubject; angle: number; r: number; x: number; y: number }[];
    const counts = subjects.map((s) => s.alerts);
    const hi = Math.max(...counts);
    const lo = Math.min(...counts);
    const near = R_MATCH + 18;
    const far = R_RIM - 24;
    return subjects.map((s, j) => {
      const t = hi === lo ? 0.5 : (s.alerts - lo) / (hi - lo);
      const r = far - t * (far - near);
      const angle = (j + 0.5) * (360 / m);
      const [x, y] = polar(r, angle);
      return { s, angle, r, x, y };
    });
  }, [subjects]);

  // Focus lights one causal path: a tap and everything it caught, or a subject
  // and every tap that saw it.
  const lit = React.useMemo(() => {
    if (!focus) return null;
    const l = new Set<string>([focus.key]);
    for (const e of linkSubject) {
      if (focus.kind === "tap" && e.from === focus.key) l.add(e.to);
      if (focus.kind === "prey" && e.to === focus.key) l.add(e.from);
    }
    return l;
  }, [focus, linkSubject]);

  const dim = (key: string) => (lit && !lit.has(key) ? 0.12 : 1);

  if (!loading && !links.length) {
    return (
      <div className={cn("flex h-full items-center justify-center p-6 text-xs text-muted-foreground", className)}>
        No tap carried traffic or matched a selector in this window
      </div>
    );
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      {/* The journey the web draws, spelled out in the same four numbers. */}
      <div className="mb-1 flex shrink-0 flex-wrap items-center gap-1.5 pb-0.5 text-[10px]">
        <Step label="carried" value={bytes(totals?.carried || 0)} sub="on the wire" color={WIRE} />
        <Arrow />
        <Step label="matched" value={compact(totals?.matched || 0)} sub="by SpiderX" color={MATCH} />
        <Arrow />
        <Step label="surfaced" value={compact(totals?.surfaced || 0)} sub="alerts" color="#F97316" />
        <Arrow />
        <Step label="identified" value={compact(totals?.subjects || 0)} sub="subjects" color="#10B981" />
        {!!totals?.degraded && (
          <span className="ml-auto shrink-0 whitespace-nowrap rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-1 font-semibold text-amber-500">
            {totals.degraded} strand{totals.degraded === 1 ? "" : "s"} broken
          </span>
        )}
      </div>

      {/* Fits the box on both axes rather than sizing by width alone: the web
          is one glance, so it must never become something to scroll. */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full"
          onMouseLeave={() => setFocus(null)}
        >
          <defs>
            <radialGradient id="webHubGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.20" />
              <stop offset="60%" stopColor="hsl(var(--primary))" stopOpacity="0.05" />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </radialGradient>
            {links.map((l) => {
              const angle = web.tapAngle.get(l.key) ?? 0;
              const [x1, y1] = polar(R_RIM, angle);
              const [x2, y2] = polar(R_HUB, angle);
              return (
                <linearGradient
                  key={l.key}
                  id={`strand-${l.key.replace(/[^a-zA-Z0-9]/g, "_")}`}
                  gradientUnits="userSpaceOnUse"
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                >
                  <stop offset="0%" stopColor={WIRE} stopOpacity="0.9" />
                  <stop offset="52%" stopColor={MATCH} stopOpacity="0.85" />
                  <stop offset="100%" stopColor={severityColor((l.worst as Severity) || "info")} stopOpacity="0.95" />
                </linearGradient>
              );
            })}
          </defs>

          <circle cx={CX} cy={CY} r={R_MATCH + 10} fill="url(#webHubGlow)" />

          {/* Structural silk: the radii, then the capture spiral strung across them. */}
          <g className="text-border" stroke="currentColor" fill="none">
            {web.angles.map((a, i) => {
              const [x1, y1] = polar(R_HUB + 6, a);
              const [x2, y2] = polar(R_RIM, a);
              return <line key={`r${i}`} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={0.6} opacity={0.7} />;
            })}
            {web.rings.map((r, i) => (
              <path key={`c${i}`} d={ringPath(r, web.angles)} strokeWidth={0.6} opacity={0.6} />
            ))}
            <path d={ringPath(R_RIM, web.angles, 0.012)} strokeWidth={1} opacity={0.8} />
          </g>

          {/* The capture ring: where SpiderX actually matches. */}
          <circle
            cx={CX}
            cy={CY}
            r={R_MATCH}
            fill="none"
            stroke={MATCH}
            strokeWidth={1}
            strokeDasharray="3 5"
            opacity={0.7}
            className="animate-ring-crawl motion-reduce:animate-none"
          />

          {/* Tap strands — the pipeline, one per link. */}
          {links.map((l) => {
            const angle = web.tapAngle.get(l.key) ?? 0;
            const meta = STATE_META[l.state];
            const wMatch = scale.match(l);
            const [bx, by] = polar(l.bytes === 0 ? R_RIM : l.hits === 0 ? R_MATCH : R_HUB, angle);
            const flow = flowSegment(l, angle, maxBytes);
            return (
              <g
                key={l.key}
                opacity={dim(l.key)}
                className="cursor-pointer"
                style={{ transition: "opacity 140ms" }}
                onMouseEnter={() => setFocus({ kind: "tap", key: l.key })}
                onClick={() => onSelect?.({ kind: "tap", key: l.key })}
              >
                <title>
                  {`${l.key} · ${meta.label} — ${meta.blurb}\n` +
                    `carried ${bytes(l.bytes)} / ${l.packets.toLocaleString()} pkts\n` +
                    `matched ${l.hits.toLocaleString()} hits over ${l.soiDocs.toLocaleString()} soi docs\n` +
                    `surfaced ${l.alerts.toLocaleString()} alerts · ${l.subjects.toLocaleString()} subjects\n` +
                    `yield ${compact(l.yield)} hits/GB`}
                </title>
                <path
                  d={strandPath(angle, scale.rim(l), wMatch, scale.hub(l))}
                  fill={`url(#strand-${l.key.replace(/[^a-zA-Z0-9]/g, "_")})`}
                />
                {/* Traffic in motion. The dashes run the length the tap
                    actually delivers — a strand that dies at the ring carries
                    nothing past it, and the flow stops there too. Busier taps
                    run faster, so rate reads without a number. */}
                {flow && (
                  <line
                    x1={flow.x1}
                    y1={flow.y1}
                    x2={flow.x2}
                    y2={flow.y2}
                    stroke="#fff"
                    strokeWidth={Math.min(1.6, Math.max(0.7, wMatch * 0.7))}
                    strokeLinecap="round"
                    strokeDasharray="3 9"
                    opacity={0.55}
                    className="animate-flow-in motion-reduce:animate-none"
                    style={{ animationDuration: `${flow.duration}s` }}
                  />
                )}
                {/* Where a strand dies, mark the break rather than leaving a
                    silent gap the eye can read as a drawing artefact. */}
                {l.state !== "live" && (
                  <circle cx={bx} cy={by} r={3.4} fill="none" stroke={meta.color} strokeWidth={1.2} />
                )}
              </g>
            );
          })}

          {/* Rim anchors and their labels — the wire, tap by tap. */}
          {links.map((l) => {
            const angle = web.tapAngle.get(l.key) ?? 0;
            const meta = STATE_META[l.state];
            const [ax, ay] = polar(R_RIM, angle);
            const [lx, ly] = polar(R_RIM + 13, angle);
            const right = Math.sin((angle - 90) * RAD + Math.PI / 2) >= 0;
            const anchor = Math.abs(angle % 360) < 6 || Math.abs((angle % 360) - 180) < 6 ? "middle" : right ? "start" : "end";
            // Lines always grow away from the hub; stacked downwards, a label
            // above the centre would run back under its own strand.
            const dy = ly - CY;
            const top = dy < -30 ? ly - 19 : dy > 30 ? ly : ly - 9;
            return (
              <g
                key={`lab-${l.key}`}
                opacity={dim(l.key)}
                className="cursor-pointer"
                style={{ transition: "opacity 140ms" }}
                onMouseEnter={() => setFocus({ kind: "tap", key: l.key })}
                onClick={() => onSelect?.({ kind: "tap", key: l.key })}
              >
                <circle cx={ax} cy={ay} r={3.6} fill={meta.color} />
                <text x={lx} y={top} textAnchor={anchor} className="fill-foreground text-[9px] font-semibold">
                  {truncate(l.key, 22)}
                </text>
                <text x={lx} y={top + 9.5} textAnchor={anchor} className="fill-muted-foreground text-[7.5px]">
                  {bytes(l.bytes)} · {compact(l.hits)} matched
                </text>
                <text x={lx} y={top + 18.5} textAnchor={anchor} className="text-[7px] font-bold" fill={meta.color}>
                  {meta.label} · {compact(l.yield)} hits/GB
                </text>
              </g>
            );
          })}

          {/* Attribution silk — which taps caught the focused subject. Only on
              focus: drawn always, it is a grey haze over the whole web. */}
          {focus?.kind === "prey" &&
            linkSubject
              .filter((e) => e.to === focus.key)
              .map((e, i) => {
                const p = prey.find((q) => q.s.alias === e.to);
                const angle = web.tapAngle.get(e.from);
                if (!p || angle == null) return null;
                const [tx, ty] = polar(R_RIM - 6, angle);
                return (
                  <line
                    key={`silk${i}`}
                    x1={p.x}
                    y1={p.y}
                    x2={tx}
                    y2={ty}
                    stroke={severityColor((p.s.priority as Severity) || "info")}
                    strokeWidth={0.9}
                    opacity={0.55}
                    strokeDasharray="2 3"
                  />
                );
              })}

          {/* Prey: the subjects SpiderX identified, each tethered to the hub. */}
          {prey.map(({ s, angle, x, y }) => {
            const tone = severityColor((s.priority as Severity) || "info");
            const active = selected?.kind === "target" && selected.key === s.alias;
            const [hx, hy] = polar(R_HUB + 2, angle);
            const right = Math.sin((angle - 90) * RAD + Math.PI / 2) >= 0;
            return (
              <g
                key={s.alias}
                opacity={dim(s.alias)}
                className="cursor-pointer"
                style={{ transition: "opacity 140ms" }}
                onMouseEnter={() => setFocus({ kind: "prey", key: s.alias })}
                onClick={() => onSelect?.({ kind: "target", key: s.alias })}
              >
                <title>
                  {`${s.alias}${s.subject ? ` · ${s.subject}` : ""}\n` +
                    `${s.alerts.toLocaleString()} alerts · ${s.priority}\n` +
                    `caught on ${s.links.length} tap${s.links.length === 1 ? "" : "s"}` +
                    (s.selectors.length ? `\nselector ${s.selectors.join(", ")}` : "")}
                </title>
                {/* Hauled in: the thread that aligns a match to its target
                    record. Drawn hub-outward so the flow runs the way the
                    attribution does — SpiderX identifies, then names the
                    subject. Dash period 6 divides the 12-unit keyframe, so the
                    loop is seamless. */}
                <line
                  x1={hx}
                  y1={hy}
                  x2={x}
                  y2={y}
                  stroke={tone}
                  strokeWidth={0.8}
                  strokeDasharray="2 4"
                  opacity={0.5}
                  className="animate-flow-in motion-reduce:animate-none"
                  style={{ animationDuration: `${(2.6 - 0.8 * Math.min(1, s.alerts / 40)).toFixed(2)}s` }}
                />
                <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${angle})`}>
                  <ellipse rx={7} ry={4.6} fill={tone} opacity={0.9} />
                  <ellipse
                    rx={7}
                    ry={4.6}
                    fill="none"
                    stroke={active ? "#fff" : tone}
                    strokeWidth={active ? 1.4 : 0.6}
                    opacity={active ? 1 : 0.6}
                  />
                  {/* Silk wrapping, so a caught subject reads as bundled. */}
                  <line x1={-3} y1={-4.2} x2={-3} y2={4.2} stroke="#000" strokeWidth={0.7} opacity={0.28} />
                  <line x1={0} y1={-4.6} x2={0} y2={4.6} stroke="#000" strokeWidth={0.7} opacity={0.28} />
                  <line x1={3} y1={-4.2} x2={3} y2={4.2} stroke="#000" strokeWidth={0.7} opacity={0.28} />
                </g>
                <text
                  x={right ? x + 11 : x - 11}
                  y={y - 1}
                  textAnchor={right ? "start" : "end"}
                  className="fill-foreground text-[8px] font-semibold"
                >
                  {truncate(s.alias, 15)}
                </text>
                <text
                  x={right ? x + 11 : x - 11}
                  y={y + 7.5}
                  textAnchor={right ? "start" : "end"}
                  className="text-[7px] font-mono"
                  fill={tone}
                >
                  {compact(s.alerts)} alerts
                </text>
              </g>
            );
          })}

          {/* SpiderX itself. */}
          <g>
            <circle
              cx={CX}
              cy={CY}
              r={R_HUB + 8}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth={1}
              opacity={0.35}
              className="animate-pulse-ring"
              style={{ transformOrigin: `${CX}px ${CY}px` }}
            />
            <circle
              cx={CX}
              cy={CY}
              r={R_HUB - 8}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth={1}
              opacity={0.45}
            />
            <circle cx={CX} cy={CY} r={12} fill="hsl(var(--primary))" opacity={0.95} />
          </g>

          {/* Zone captions, so the radial axis is never a guess. */}
          <text x={CX} y={CY + R_HUB + 26} textAnchor="middle" className="fill-muted-foreground text-[7.5px]">
            SpiderX · {compact(totals?.matched || 0)} matched
          </text>
        </svg>
      </div>

      <div className="mt-1 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-muted-foreground">
        <Legend swatch={WIRE} text="strand width at rim = bytes carried" />
        <Legend swatch={MATCH} text="at the ring = selector matches" />
        <Legend swatch={severityColor("high")} text="at the hub = alerts, by priority" />
        <span className="ml-auto">
          {totals && totals.subjects > (data?.subjects?.length || 0)
            ? `${data?.subjects?.length || 0} of ${totals.subjects.toLocaleString()} caught · hover to trace`
            : "hover a strand or a catch to trace it"}
        </span>
      </div>
    </div>
  );
}

function Step({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <span className="ndr-inset flex shrink-0 items-center gap-1.5 whitespace-nowrap px-2 py-1">
      <span className="h-2.5 w-0.5 rounded" style={{ background: color }} />
      <span>
        <span className="font-semibold text-foreground">{value}</span>{" "}
        <span className="text-muted-foreground">{label}</span>
        <span className="ml-1 text-muted-foreground/70">{sub}</span>
      </span>
    </span>
  );
}

function Arrow() {
  return <span className="shrink-0 text-muted-foreground/60">→</span>;
}

function Legend({ swatch, text }: { swatch: string; text: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="h-1.5 w-3 rounded-sm" style={{ background: swatch, opacity: 0.75 }} />
      {text}
    </span>
  );
}
