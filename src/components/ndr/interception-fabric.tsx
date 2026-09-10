"use client";

import * as React from "react";
import { severityColor } from "@/lib/types";
import type { Detection, Severity } from "@/lib/types";
import { cn } from "@/lib/utils";

export type FabricProbe = {
  key: string;
  ip?: string;
  links: number;
  bytes: number;
  packets: number;
  hits: number;
  alerts: number;
  dark: number;
};

export type FabricLink = {
  key: string;
  iface: string;
  probe: string;
  probeIp?: string;
  bytes: number;
  packets: number;
  /** link-stats documents behind the byte counters. */
  statDocs: number;
  soiDocs: number;
  hits: number;
  alerts: number;
  subjects: number;
  selectors: number;
  worst: Severity | string;
  protocols: string[];
  types: string[];
  yield: number;
  state: "live" | "dark" | "blind" | "silent";
  spark: number[];
};

export type FabricSubject = {
  alias: string;
  subject: string | null;
  priority: Severity | string;
  alerts: number;
  selectors: string[];
  links: string[];
  latest: Detection | null;
};

export type FabricEdge = {
  from: string;
  to: string;
  weight: number;
  tone?: string;
};

/** What the inspector is currently reading: one tap, or one target. */
export type FlowSelection =
  | { kind: "tap"; key: string }
  | { kind: "target"; key: string };

export type FabricData = {
  probes?: FabricProbe[];
  links?: FabricLink[];
  subjects?: FabricSubject[];
  edges?: { probeLink?: FabricEdge[]; linkSubject?: FabricEdge[] };
  totals?: {
    carried: number;
    packets: number;
    matched: number;
    surfaced: number;
    soiDocs: number;
    subjects: number;
    shownSubjects: number;
    taps: number;
    degraded: number;
  };
  interval?: string;
};

/* ── geometry ─────────────────────────────────────────────────────────────
 * A fixed viewBox width keeps SVG units roughly 1:1 with rendered pixels at
 * the panel's usual size, so type set in units still reads as type.
 */
const W = 720;
const PAD_TOP = 30;
const PAD_BOTTOM = 10;

const PROBE_X = 6;
const PROBE_W = 96;
const LINK_X = 188;
const LINK_W = 306;
const SUBJ_X = 556;
const SUBJ_W = 158;

const LINK_H = 92;
const LINK_GAP = 12;
const SUBJ_H = 34;
const SUBJ_GAP = 8;
const PROBE_MIN_H = 62;

const WIRE = "hsl(199 89% 48%)";

/**
 * Plain-language health for a monitored line. The customer reading this may
 * not be technical, so the label is a verdict and the blurb says what to do
 * about it — never an index name or a component name.
 */
export const STATE_META: Record<
  FabricLink["state"],
  { color: string; label: string; blurb: string }
> = {
  live: {
    color: "#10B981",
    label: "WORKING",
    blurb:
      "Traffic is flowing on this line and SpiderX is finding matches on it.",
  },
  dark: {
    color: "#F59E0B",
    label: "NOTHING MATCHING",
    blurb:
      "Traffic is flowing, but nothing on your watch list has matched here. Worth checking that the right details are being watched.",
  },
  blind: {
    color: "#E11D2E",
    label: "NO TRAFFIC READING",
    blurb:
      "SpiderX is finding matches here, but this line has stopped reporting how much traffic it carries. The matches are real; the traffic figure is missing.",
  },
  silent: {
    color: "#64748B",
    label: "QUIET",
    blurb: "No traffic and no matches on this line during this period.",
  },
};

export function compact(n: number) {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

export function bytes(n: number) {
  const u = ["B", "KB", "MB", "GB", "TB", "PB"];
  let v = Math.max(0, n);
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Sankey-style band: forward along the top edge, back along the bottom. */
function ribbonPath(
  x0: number,
  y0a: number,
  y0b: number,
  x1: number,
  y1a: number,
  y1b: number,
) {
  const mx = (x0 + x1) / 2;
  return [
    `M${x0},${y0a}`,
    `C${mx},${y0a} ${mx},${y1a} ${x1},${y1a}`,
    `L${x1},${y1b}`,
    `C${mx},${y1b} ${mx},${y0b} ${x0},${y0b}`,
    "Z",
  ].join(" ");
}

type Box = { x: number; y: number; w: number; h: number };

/**
 * Lay a tier's ribbons out so no node's bands can overflow its own edge: pick
 * one weight-to-height scale for the whole tier, driven by whichever node is
 * most oversubscribed.
 */
function tierScale(edges: FabricEdge[], boxes: Map<string, Box>, fill = 0.78) {
  const out = new Map<string, number>();
  const inn = new Map<string, number>();
  for (const e of edges) {
    out.set(e.from, (out.get(e.from) || 0) + Math.max(0, e.weight));
    inn.set(e.to, (inn.get(e.to) || 0) + Math.max(0, e.weight));
  }
  let scale = Infinity;
  for (const [key, sum] of [...out, ...inn]) {
    const box = boxes.get(key);
    if (!box || sum <= 0) continue;
    scale = Math.min(scale, (box.h * fill) / sum);
  }
  return Number.isFinite(scale) ? scale : 0;
}

/** Stacked anchor offsets on both ends of one tier's ribbons. */
function layoutRibbons(
  edges: FabricEdge[],
  from: Map<string, Box>,
  to: Map<string, Box>,
  scale: number,
  minThickness = 1.1,
) {
  const outCur = new Map<string, number>();
  const inCur = new Map<string, number>();
  const bands: {
    edge: FabricEdge;
    x0: number;
    y0a: number;
    y0b: number;
    x1: number;
    y1a: number;
    y1b: number;
  }[] = [];

  for (const e of edges) {
    const a = from.get(e.from);
    const b = to.get(e.to);
    if (!a || !b) continue;
    const t = Math.max(minThickness, Math.max(0, e.weight) * scale);

    const aStart = a.y + a.h * 0.11 + (outCur.get(e.from) || 0);
    const bStart = b.y + b.h * 0.11 + (inCur.get(e.to) || 0);
    outCur.set(e.from, (outCur.get(e.from) || 0) + t);
    inCur.set(e.to, (inCur.get(e.to) || 0) + t);

    bands.push({
      edge: e,
      x0: a.x + a.w,
      y0a: aStart,
      y0b: aStart + t,
      x1: b.x,
      y1a: bStart,
      y1b: bStart + t,
    });
  }
  return bands;
}

/** Normalised polyline for a link card's SOI-hit sparkline. */
function sparkPoints(
  values: number[],
  x: number,
  y: number,
  w: number,
  h: number,
) {
  if (values.length < 2) return "";
  const max = Math.max(...values, 1);
  const step = w / (values.length - 1);
  return values
    .map((v, i) => `${x + i * step},${y + h - (v / max) * h}`)
    .join(" ");
}

/**
 * The Interception Fabric.
 *
 * SpiderX writes each stage of an interception into a different index, so no
 * single chart has ever been able to answer "did this tap earn its capacity?".
 * `link_name` is the one key all three share — link-stats counts what the tap
 * *carried*, soi-stats counts what the selectors *matched* on it, and
 * logvehere-alerts names the subject that *surfaced*. Joining them on that key
 * turns three volume charts into one causal chain, drawn left to right:
 *
 *     probe  ──(bytes on the wire)──▶  tap  ──(alerts raised)──▶  subject
 *
 * Left ribbons are capacity, right ribbons are yield, and the card in between
 * carries the funnel that converts one into the other. A tap whose left ribbon
 * is fat and whose right ribbons are missing is the failure this panel exists
 * to make obvious.
 */
export function InterceptionFabric({
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
  const [focus, setFocus] = React.useState<{
    tier: "probe" | "link" | "subject";
    key: string;
  } | null>(null);

  // Memoised: a bare `?? []` mints a new array every render, which would make
  // every layout memo below recompute on each paint.
  const probes = React.useMemo(() => data?.probes || [], [data]);
  const links = React.useMemo(() => data?.links || [], [data]);
  const subjects = React.useMemo(() => data?.subjects || [], [data]);
  const probeLink = React.useMemo(() => data?.edges?.probeLink || [], [data]);
  const linkSubject = React.useMemo(
    () => data?.edges?.linkSubject || [],
    [data],
  );
  const totals = data?.totals;

  // Positions. Links drive the canvas height; the other two tiers are centred
  // against it so the ribbons stay short and readable.
  const geometry = React.useMemo(() => {
    const linkTierH = links.length
      ? links.length * LINK_H + (links.length - 1) * LINK_GAP
      : 0;
    const subjTierH = subjects.length
      ? subjects.length * SUBJ_H + (subjects.length - 1) * SUBJ_GAP
      : 0;
    const bodyH = Math.max(linkTierH, subjTierH, PROBE_MIN_H);
    const height = PAD_TOP + bodyH + PAD_BOTTOM;

    const linkBox = new Map<string, Box>();
    const linkTop = PAD_TOP + (bodyH - linkTierH) / 2;
    links.forEach((l, i) => {
      linkBox.set(l.key, {
        x: LINK_X,
        y: linkTop + i * (LINK_H + LINK_GAP),
        w: LINK_W,
        h: LINK_H,
      });
    });

    const subjBox = new Map<string, Box>();
    const subjTop = PAD_TOP + (bodyH - subjTierH) / 2;
    subjects.forEach((s, i) => {
      subjBox.set(s.alias, {
        x: SUBJ_X,
        y: subjTop + i * (SUBJ_H + SUBJ_GAP),
        w: SUBJ_W,
        h: SUBJ_H,
      });
    });

    // A probe is as tall as the taps it owns, so the ribbons leaving it fan out
    // of the span it is actually responsible for.
    const probeBox = new Map<string, Box>();
    for (const p of probes) {
      const owned = links
        .filter((l) => l.probe === p.key)
        .map((l) => linkBox.get(l.key)!)
        .filter(Boolean);
      if (owned.length) {
        const top = Math.min(...owned.map((b) => b.y));
        const bottom = Math.max(...owned.map((b) => b.y + b.h));
        const h = Math.max(PROBE_MIN_H, bottom - top);
        probeBox.set(p.key, {
          x: PROBE_X,
          y: top + (bottom - top - h) / 2,
          w: PROBE_W,
          h,
        });
      } else {
        probeBox.set(p.key, {
          x: PROBE_X,
          y: PAD_TOP,
          w: PROBE_W,
          h: PROBE_MIN_H,
        });
      }
    }

    return { height, linkBox, subjBox, probeBox };
  }, [links, subjects, probes]);

  const { height, linkBox, subjBox, probeBox } = geometry;

  const wireBands = React.useMemo(() => {
    const scale = tierScale(probeLink, new Map([...probeBox, ...linkBox]), 0.7);
    return layoutRibbons(probeLink, probeBox, linkBox, scale, 2);
  }, [probeLink, probeBox, linkBox]);

  const yieldBands = React.useMemo(() => {
    // Sorted so bands stack in tier order at both ends and stop crossing.
    const order = new Map(links.map((l, i) => [l.key, i]));
    const sOrder = new Map(subjects.map((s, i) => [s.alias, i]));
    const sorted = [...linkSubject]
      .filter((e) => linkBox.has(e.from) && subjBox.has(e.to))
      .sort(
        (a, b) =>
          (order.get(a.from) ?? 0) - (order.get(b.from) ?? 0) ||
          (sOrder.get(a.to) ?? 0) - (sOrder.get(b.to) ?? 0),
      );
    const scale = tierScale(sorted, new Map([...linkBox, ...subjBox]), 0.78);
    return layoutRibbons(sorted, linkBox, subjBox, scale, 0.9);
  }, [linkSubject, links, subjects, linkBox, subjBox]);

  // What the current focus keeps lit. Focusing a tap lights its probe and every
  // subject it fed; focusing a subject lights every tap that saw it.
  const lit = React.useMemo(() => {
    if (!focus) return null;
    const l = new Set<string>([focus.key]);
    if (focus.tier === "link") {
      const link = links.find((x) => x.key === focus.key);
      if (link) l.add(link.probe);
      for (const e of linkSubject) if (e.from === focus.key) l.add(e.to);
    } else if (focus.tier === "subject") {
      for (const e of linkSubject) {
        if (e.to !== focus.key) continue;
        l.add(e.from);
        const link = links.find((x) => x.key === e.from);
        if (link) l.add(link.probe);
      }
    } else {
      for (const e of probeLink) {
        if (e.from !== focus.key) continue;
        l.add(e.to);
        for (const s of linkSubject) if (s.from === e.to) l.add(s.to);
      }
    }
    return l;
  }, [focus, links, linkSubject, probeLink]);

  const dim = (key: string) => (lit && !lit.has(key) ? 0.14 : 1);
  const bandDim = (from: string, to: string) =>
    lit && !(lit.has(from) && lit.has(to)) ? 0.07 : 1;

  const maxBytes = Math.max(1, ...links.map((l) => l.bytes));
  const maxHits = Math.max(1, ...links.map((l) => l.hits));

  if (!loading && !links.length) {
    return (
      <div
        className={cn(
          "flex h-full items-center justify-center p-6 text-xs text-muted-foreground",
          className,
        )}
      >
        No monitored line carried traffic or found a match in this period
      </div>
    );
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      {/* The funnel, in words: the same four numbers the fabric draws. */}
      <div className="scroll-thin mb-2 flex shrink-0 items-center gap-1.5 overflow-x-auto pb-0.5 text-[10px]">
        <FunnelStep
          label="of traffic seen"
          value={bytes(totals?.carried || 0)}
          sub={`${compact(totals?.packets || 0)} packets`}
          color={WIRE}
        />
        <Arrow />
        <FunnelStep
          label="matched your watch list"
          value={compact(totals?.matched || 0)}
          sub=""
          color="#A855F7"
        />
        <Arrow />
        <FunnelStep
          label="alerts raised"
          value={compact(totals?.surfaced || 0)}
          sub=""
          color="#F97316"
        />
        <Arrow />
        <FunnelStep
          label="people identified"
          value={compact(totals?.subjects || 0)}
          sub={`on ${totals?.taps || 0} lines`}
          color="#10B981"
        />
        {!!totals?.degraded && (
          <span className="ml-auto shrink-0 whitespace-nowrap rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-1 font-semibold text-amber-500">
            {totals.degraded} line{totals.degraded === 1 ? "" : "s"} need
            attention
          </span>
        )}
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <svg
          viewBox={`0 0 ${W} ${height}`}
          className="h-auto w-full"
          onMouseLeave={() => setFocus(null)}
        >
          <defs>
            <linearGradient id="fabricWire" x1="0" x2="1">
              <stop offset="0%" stopColor={WIRE} stopOpacity="0.10" />
              <stop offset="100%" stopColor={WIRE} stopOpacity="0.42" />
            </linearGradient>
          </defs>

          <TierLabel x={PROBE_X} text="SpiderX Edge" hint="where we listen" />
          <TierLabel
            x={LINK_X}
            text="MONITORED LINE"
            hint="traffic seen, and what matched on it"
          />
          <TierLabel x={SUBJ_X} text="SUBJECT" hint="alerts, by alias" />

          {/* Capacity ribbons: what the wire handed each tap. */}
          <g>
            {wireBands.map((b, i) => (
              <path
                key={`w${i}`}
                d={ribbonPath(b.x0, b.y0a, b.y0b, b.x1, b.y1a, b.y1b)}
                fill="url(#fabricWire)"
                opacity={bandDim(b.edge.from, b.edge.to)}
                style={{ transition: "opacity 140ms" }}
              >
                <title>{`${b.edge.from} → ${b.edge.to} · ${bytes(b.edge.weight)} on the wire`}</title>
              </path>
            ))}
          </g>

          {/* Yield ribbons: what each tap actually surfaced, and to whom. */}
          <g>
            {yieldBands.map((b, i) => (
              <path
                key={`y${i}`}
                d={ribbonPath(b.x0, b.y0a, b.y0b, b.x1, b.y1a, b.y1b)}
                fill={severityColor((b.edge.tone as Severity) || "info")}
                opacity={0.34 * bandDim(b.edge.from, b.edge.to)}
                style={{ transition: "opacity 140ms" }}
              >
                <title>{`${b.edge.from} → ${b.edge.to} · ${b.edge.weight.toLocaleString()} alerts`}</title>
              </path>
            ))}
          </g>

          {/* Probe tier */}
          {probes.map((p) => {
            const box = probeBox.get(p.key);
            if (!box) return null;
            return (
              <g
                key={p.key}
                opacity={dim(p.key)}
                className="cursor-pointer"
                style={{ transition: "opacity 140ms" }}
                onMouseEnter={() => setFocus({ tier: "probe", key: p.key })}
              >
                <title>{`${p.key}${p.ip ? ` · ${p.ip}` : ""} · ${p.links} taps · ${bytes(p.bytes)} · ${compact(p.hits)} matched`}</title>
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.w}
                  height={box.h}
                  rx={6}
                  className="fill-card stroke-border"
                  strokeWidth={1}
                />
                <rect
                  x={box.x}
                  y={box.y}
                  width={2.5}
                  height={box.h}
                  rx={1.2}
                  fill={WIRE}
                />
                {/* The card is as tall as the taps it owns, so the copy is
                    centred rather than stranded at the top of a long box. */}
                <g
                  transform={`translate(0 ${Math.round(box.y + box.h / 2 - 34)})`}
                >
                  <text
                    x={box.x + 9}
                    y={17}
                    className="fill-foreground text-[10px] font-semibold"
                  >
                    {truncate(p.key, 13)}
                  </text>
                  <text
                    x={box.x + 9}
                    y={29}
                    className="fill-muted-foreground font-mono text-[8px]"
                  >
                    {p.ip || "—"}
                  </text>
                  <text
                    x={box.x + 9}
                    y={47}
                    className="fill-foreground text-[11px] font-semibold"
                  >
                    {bytes(p.bytes)}
                  </text>
                  <text
                    x={box.x + 9}
                    y={58}
                    className="fill-muted-foreground text-[8px]"
                  >
                    {p.links} tap{p.links === 1 ? "" : "s"}
                  </text>
                  <text
                    x={box.x + 9}
                    y={68}
                    className="fill-muted-foreground text-[8px]"
                  >
                    {compact(p.hits)} matched
                  </text>
                  {p.dark > 0 && (
                    <text
                      x={box.x + 9}
                      y={80}
                      className="text-[8px] font-semibold"
                      fill="#F59E0B"
                    >
                      {p.dark} degraded
                    </text>
                  )}
                </g>
              </g>
            );
          })}

          {/* Tap tier — the join itself */}
          {links.map((l) => {
            const box = linkBox.get(l.key);
            if (!box) return null;
            const meta = STATE_META[l.state];
            const barW = LINK_W - 104;
            return (
              <g
                key={l.key}
                opacity={dim(l.key)}
                className="cursor-pointer"
                style={{ transition: "opacity 140ms" }}
                onMouseEnter={() => setFocus({ tier: "link", key: l.key })}
                onClick={() => onSelect?.({ kind: "tap", key: l.key })}
              >
                <title>
                  {`${l.key} · ${meta.label} — ${meta.blurb}\n` +
                    `carried ${bytes(l.bytes)} / ${l.packets.toLocaleString()} pkts\n` +
                    `matched ${l.hits.toLocaleString()} hits over ${l.soiDocs.toLocaleString()} soi docs\n` +
                    `surfaced ${l.alerts.toLocaleString()} alerts · ${l.subjects.toLocaleString()} subjects · ${l.selectors.toLocaleString()} selectors\n` +
                    `yield ${compact(l.yield)} hits/GB`}
                </title>
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.w}
                  height={box.h}
                  rx={7}
                  className="fill-card"
                  stroke={
                    selected?.kind === "tap" && selected.key === l.key
                      ? meta.color
                      : "currentColor"
                  }
                  strokeOpacity={
                    selected?.kind === "tap" && selected.key === l.key
                      ? 1
                      : 0.35
                  }
                  strokeWidth={
                    selected?.kind === "tap" && selected.key === l.key ? 1.6 : 1
                  }
                />
                <rect
                  x={box.x}
                  y={box.y}
                  width={3}
                  height={box.h}
                  rx={1.5}
                  fill={meta.color}
                />

                <circle
                  cx={box.x + 14}
                  cy={box.y + 15}
                  r={3.2}
                  fill={meta.color}
                />
                <text
                  x={box.x + 22}
                  y={box.y + 18}
                  className="fill-foreground text-[10.5px] font-semibold"
                >
                  {truncate(l.key, 24)}
                </text>
                <rect
                  x={box.x + box.w - 46}
                  y={box.y + 8}
                  width={38}
                  height={13}
                  rx={3}
                  fill={meta.color}
                  opacity={0.16}
                />
                <text
                  x={box.x + box.w - 27}
                  y={box.y + 17.5}
                  textAnchor="middle"
                  className="text-[7.5px] font-bold"
                  fill={meta.color}
                >
                  {meta.label}
                </text>

                {/* The funnel: carried on the wire, then what matched on it. The
                    two bars share an axis, so the drop between them is the
                    selector's real selectivity on this tap. */}
                <FunnelBar
                  x={box.x + 12}
                  y={box.y + 30}
                  w={barW}
                  label="carried"
                  value={bytes(l.bytes)}
                  frac={l.bytes / maxBytes}
                  color={WIRE}
                />
                <FunnelBar
                  x={box.x + 12}
                  y={box.y + 48}
                  w={barW}
                  label="matched"
                  value={`${compact(l.hits)} hits`}
                  frac={l.hits / maxHits}
                  color="#A855F7"
                />

                {/* Footer, in two lanes: the counts this tap produced on the
                    left, its yield and the shape of that yield on the right. */}
                <text
                  x={box.x + 12}
                  y={box.y + 74}
                  className="fill-muted-foreground text-[8px]"
                >
                  <tspan className="fill-foreground font-semibold">
                    {compact(l.alerts)}
                  </tspan>{" "}
                  alerts ·{" "}
                  <tspan className="fill-foreground font-semibold">
                    {compact(l.subjects)}
                  </tspan>{" "}
                  subjects ·{" "}
                  <tspan className="fill-foreground font-semibold">
                    {compact(l.selectors)}
                  </tspan>{" "}
                  selectors
                </text>
                {/* Clipped to the left lane — a pcap-replay tap names itself
                    after the capture file, which is long enough to run under
                    the yield figure. */}
                <text
                  x={box.x + 12}
                  y={box.y + 85}
                  className="fill-muted-foreground text-[7.5px]"
                >
                  {truncate(
                    [l.iface, ...l.types, ...l.protocols.slice(0, 2)]
                      .filter(Boolean)
                      .join(" · "),
                    36,
                  )}
                </text>

                {l.spark.length > 1 && (
                  <polyline
                    points={sparkPoints(
                      l.spark,
                      box.x + box.w - 92,
                      box.y + 64,
                      82,
                      11,
                    )}
                    fill="none"
                    stroke={meta.color}
                    strokeWidth={1}
                    strokeLinejoin="round"
                    opacity={0.7}
                  />
                )}
                <text
                  x={box.x + box.w - 10}
                  y={box.y + 86}
                  textAnchor="end"
                  className="text-[8px]"
                >
                  <tspan className="fill-foreground font-semibold">
                    {compact(l.yield)}
                  </tspan>
                  <tspan className="fill-muted-foreground"> hits/GB</tspan>
                </text>
              </g>
            );
          })}

          {/* Subject tier */}
          {subjects.map((s) => {
            const box = subjBox.get(s.alias);
            if (!box) return null;
            const tone = severityColor((s.priority as Severity) || "info");
            const active =
              selected?.kind === "target" && selected.key === s.alias;
            return (
              <g
                key={s.alias}
                opacity={dim(s.alias)}
                className="cursor-pointer"
                style={{ transition: "opacity 140ms" }}
                onMouseEnter={() => setFocus({ tier: "subject", key: s.alias })}
                onClick={() => onSelect?.({ kind: "target", key: s.alias })}
              >
                <title>
                  {`${s.alias}${s.subject ? ` · ${s.subject}` : ""}\n` +
                    `${s.alerts.toLocaleString()} alerts · ${s.priority}\n` +
                    `seen on ${s.links.length} tap${s.links.length === 1 ? "" : "s"}` +
                    (s.selectors.length
                      ? `\nselector ${s.selectors.join(", ")}`
                      : "")}
                </title>
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.w}
                  height={box.h}
                  rx={5}
                  className="fill-card"
                  stroke={active ? tone : "currentColor"}
                  strokeWidth={active ? 1.4 : 1}
                  strokeOpacity={active ? 1 : 0.22}
                />
                <rect
                  x={box.x}
                  y={box.y}
                  width={2.5}
                  height={box.h}
                  rx={1.2}
                  fill={tone}
                />
                <text
                  x={box.x + 8}
                  y={box.y + 14}
                  className="fill-foreground text-[9.5px] font-semibold"
                >
                  {truncate(s.alias, 17)}
                </text>
                <text
                  x={box.x + 8}
                  y={box.y + 25}
                  className="fill-muted-foreground text-[7.5px]"
                >
                  {truncate(s.subject || s.selectors[0] || "—", 20)}
                </text>
                <text
                  x={box.x + box.w - 8}
                  y={box.y + 20}
                  textAnchor="end"
                  className="text-[9px] font-bold font-mono"
                  fill={tone}
                >
                  {compact(s.alerts)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-1.5 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-muted-foreground">
        <Legend swatch={WIRE} text="traffic carried" />
        <Legend swatch={"#A855F7"} text="matches against your watch list" />
        <Legend
          swatch={severityColor("high")}
          text="alerts, coloured by priority"
        />
        <span className="ml-auto">
          {totals && totals.subjects > totals.shownSubjects
            ? `showing ${totals.shownSubjects} of ${totals.subjects.toLocaleString()} people · hover a line to trace it`
            : "hover a line to trace it"}
        </span>
      </div>
    </div>
  );
}

/** One bar of a tap's carried→matched funnel, scaled against the busiest tap. */
function FunnelBar({
  x,
  y,
  w,
  label,
  value,
  frac,
  color,
}: {
  x: number;
  y: number;
  w: number;
  label: string;
  value: string;
  frac: number;
  color: string;
}) {
  const f = Math.max(0, Math.min(1, Number.isFinite(frac) ? frac : 0));
  return (
    <g>
      <text x={x} y={y + 7} className="fill-muted-foreground text-[7.5px]">
        {label}
      </text>
      <rect
        x={x + 34}
        y={y}
        width={w}
        height={8}
        rx={2}
        className="fill-muted"
        opacity={0.35}
      />
      <rect
        x={x + 34}
        y={y}
        width={Math.max(f * w, f > 0 ? 1.5 : 0)}
        height={8}
        rx={2}
        fill={color}
        opacity={0.85}
      />
      <text
        x={x + 34 + w + 6}
        y={y + 7}
        className="fill-foreground text-[8px] font-medium"
      >
        {value}
      </text>
    </g>
  );
}

function TierLabel({
  x,
  text,
  hint,
}: {
  x: number;
  text: string;
  hint: string;
}) {
  return (
    <g>
      <text
        x={x}
        y={11}
        className="fill-foreground text-[8px] font-bold tracking-[0.14em]"
      >
        {text}
      </text>
      <text x={x} y={21} className="fill-muted-foreground text-[7px]">
        {hint}
      </text>
    </g>
  );
}

function FunnelStep({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
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
      <span
        className="h-1.5 w-3 rounded-sm"
        style={{ background: swatch, opacity: 0.7 }}
      />
      {text}
    </span>
  );
}
