"use client";

import * as React from "react";
import { severityColor, type Severity } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  bytes,
  compact,
  STATE_META,
  type FabricData,
  type FlowSelection,
} from "./interception-fabric";

/* ── anatomy ──────────────────────────────────────────────────────────────
 * The creature runs left to right and every part of it is a stage:
 *
 *   legs ──▶ cephalothorax ──▶ waist ──▶ abdomen ──▶ silk ──▶ targets
 *   wire     everything        the       what        the       the target
 *            carried          filter    matched     spinning   record
 *
 * The waist is the point of the whole drawing: a spider's body narrows
 * between its two halves exactly where SpiderX narrows between what the wire
 * handed it and what its selectors kept.
 */
/* Proportioned for a tall centre column: a wide, short canvas would scale to
   the column's width and leave most of its height empty. */
const VB_W = 790;
const VB_H = 620;

const LABEL_R = 124;
const LEG_START = 132;
const HEAD_X = 262;
const HEAD_W = 108;
const WAIST_W = 42;
const ABD_W = 124;
const SILK_GAP = 70;
const CARD_W = 178;

const WAIST_X = HEAD_X + HEAD_W;
const ABD_X = WAIST_X + WAIST_W;
const SPIN_X = ABD_X + ABD_W;
const CARD_X = SPIN_X + SILK_GAP;

const BODY_CY = 306;
const HEAD_H = 94;
const ABD_H = 130;
const WAIST_H = 26;

const TOP = 76;
const BOTTOM = 556;

const WIRE = "hsl(199 89% 48%)";
const MATCH = "#A855F7";

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Evenly spread n rows down the working area, centred when there is only one. */
function lane(i: number, n: number) {
  if (n <= 1) return (TOP + BOTTOM) / 2;
  return TOP + (i * (BOTTOM - TOP)) / (n - 1);
}

/**
 * A leg: out from the wire, bending once, onto the body. The single control
 * pair near the body is what gives it a joint instead of a swoop.
 */
function legPath(x0: number, y0: number, x1: number, y1: number) {
  const midX = x0 + (x1 - x0) * 0.55;
  return `M${x0},${y0.toFixed(1)} C${midX},${y0.toFixed(1)} ${x0 + (x1 - x0) * 0.72},${y1.toFixed(
    1
  )} ${x1},${y1.toFixed(1)}`;
}

/** Silk, spun out of the abdomen and made fast to a target record. */
function silkPath(x0: number, y0: number, x1: number, y1: number) {
  const midX = x0 + (x1 - x0) / 2;
  return `M${x0},${y0.toFixed(1)} C${midX},${y0.toFixed(1)} ${midX},${y1.toFixed(1)} ${x1},${y1.toFixed(1)}`;
}

/**
 * The SpiderX Flow.
 *
 * One creature, read left to right, carrying the whole interception in its
 * own anatomy. Traffic arrives on the legs — one per tap, thickness set by
 * what that tap carried on the wire. The legs meet at the cephalothorax,
 * which holds everything SpiderX ingested. Behind it the body narrows to a
 * waist: that constriction is the selector layer, and the drop across it is
 * the real one — packets in, hits out. The abdomen holds what matched. From
 * its spinnerets, silk runs out to the target records the matches were
 * aligned to, one thread per subject, weighted by the alerts it raised.
 *
 * Everything is the same three-way join as the other views — link-stats for
 * what was carried, soi-stats for what matched, logvehere-alerts for who it
 * turned out to be, joined on `link_name`.
 */
export function SpiderxFlow({
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
  const [focus, setFocus] = React.useState<{ kind: "tap" | "target"; key: string } | null>(null);

  const links = React.useMemo(() => (data?.links || []).slice(0, 9), [data]);
  const subjects = React.useMemo(() => (data?.subjects || []).slice(0, 8), [data]);
  const linkSubject = React.useMemo(() => data?.edges?.linkSubject || [], [data]);
  const totals = data?.totals;

  const maxBytes = Math.max(1, ...links.map((l) => l.bytes));
  const maxAlerts = Math.max(1, ...subjects.map((s) => s.alerts));

  const lit = React.useMemo(() => {
    if (!focus) return null;
    const set = new Set<string>([focus.key]);
    for (const e of linkSubject) {
      if (focus.kind === "tap" && e.from === focus.key) set.add(e.to);
      if (focus.kind === "target" && e.to === focus.key) set.add(e.from);
    }
    return set;
  }, [focus, linkSubject]);

  const dim = (key: string) => (lit && !lit.has(key) ? 0.13 : 1);

  // Packets in, hits out: the one ratio across the waist whose two sides are
  // actually comparable, and the honest measure of how selective SpiderX is.
  const selectivity =
    totals && totals.matched > 0 && totals.packets > 0
      ? `1 match in every ${compact(Math.round(totals.packets / totals.matched))} packets`
      : null;

  if (!loading && !links.length) {
    return (
      <div className={cn("flex h-full items-center justify-center p-6 text-xs text-muted-foreground", className)}>
        No monitored line carried traffic or found a match in this period
      </div>
    );
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="min-h-0 flex-1 overflow-hidden">
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full"
          onMouseLeave={() => setFocus(null)}
        >
          <defs>
            <linearGradient id="flowBody" x1="0" x2="1">
              <stop offset="0%" stopColor={WIRE} stopOpacity="0.55" />
              <stop offset="55%" stopColor={MATCH} stopOpacity="0.5" />
              <stop offset="100%" stopColor="#F97316" stopOpacity="0.5" />
            </linearGradient>
            <radialGradient id="flowCore" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.28" />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </radialGradient>
          </defs>

          <Stage x={8} label="1 · TRAFFIC WE SAW" hint="measured on each monitored line" />
          <Stage x={HEAD_X} label="2 · INTO SPIDERX" hint="everything we examined" />
          <Stage x={ABD_X} label="3 · MATCHED YOUR LIST" hint="the details you asked us to watch" />
          <Stage x={CARD_X} label="4 · WHO IT WAS" hint="matched back to a person on file" />

          <ellipse cx={(WAIST_X + ABD_X) / 2} cy={BODY_CY} rx={200} ry={150} fill="url(#flowCore)" />

          {/* ── 1 · the legs: what each tap put on the wire ── */}
          {links.map((l, i) => {
            const y = lane(i, links.length);
            const attachY = BODY_CY + (y - BODY_CY) * 0.26;
            const meta = STATE_META[l.state];
            const w = l.bytes > 0 ? 1.6 + 6.4 * (l.bytes / maxBytes) : 1.2;
            const d = legPath(LEG_START, y, HEAD_X, attachY);
            // Busier legs run faster, so throughput reads without a number.
            const dur = (3 - 1.7 * Math.min(1, l.bytes / maxBytes)).toFixed(2);
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
                  {`${l.key} — ${meta.label}\n${meta.blurb}\n\n` +
                    `Traffic seen: ${bytes(l.bytes)} (${l.packets.toLocaleString()} packets)\n` +
                    `Matched your watch list: ${l.hits.toLocaleString()}\n` +
                    `Alerts raised: ${l.alerts.toLocaleString()}\n` +
                    `Finds ${compact(l.yield)} matches per GB of traffic`}
                </title>
                <path d={d} fill="none" stroke={WIRE} strokeWidth={w} strokeLinecap="round" opacity={0.5} />
                <path
                  d={d}
                  fill="none"
                  stroke="#fff"
                  strokeWidth={Math.min(1.5, w * 0.45)}
                  strokeLinecap="round"
                  strokeDasharray="3 9"
                  opacity={0.6}
                  className="animate-flow-in motion-reduce:animate-none"
                  style={{ animationDuration: `${dur}s` }}
                />
                {/* A tap that carries but never matches contributes nothing
                    past the waist — flag it on the leg that brought it in. */}
                {l.state !== "live" && (
                  <circle cx={HEAD_X - 6} cy={attachY} r={3.6} fill="none" stroke={meta.color} strokeWidth={1.3} />
                )}
                <circle cx={LEG_START} cy={y} r={3.2} fill={meta.color} />
                <text x={LABEL_R} y={y - 3} textAnchor="end" className="fill-foreground text-[10px] font-semibold">
                  {truncate(l.key, 24)}
                </text>
                <text x={LABEL_R} y={y + 7} textAnchor="end" className="fill-muted-foreground text-[8px]">
                  {bytes(l.bytes)} · {compact(l.packets)} packets
                </text>
                <text x={LABEL_R} y={y + 16.5} textAnchor="end" className="text-[7.5px] font-bold" fill={meta.color}>
                  {meta.label} · finds {compact(l.yield)}/GB
                </text>
              </g>
            );
          })}

          {/* ── 2 · cephalothorax: everything SpiderX ingested ── */}
          <g>
            <rect
              x={HEAD_X}
              y={BODY_CY - HEAD_H / 2}
              width={HEAD_W}
              height={HEAD_H}
              rx={40}
              fill="url(#flowBody)"
              stroke={WIRE}
              strokeWidth={1}
              strokeOpacity={0.5}
            />
            <text x={HEAD_X + HEAD_W / 2} y={BODY_CY - 20} textAnchor="middle" className="fill-muted-foreground text-[8px] font-semibold tracking-wide">
              TRAFFIC SEEN
            </text>
            <text x={HEAD_X + HEAD_W / 2} y={BODY_CY + 1} textAnchor="middle" className="fill-foreground text-[17px] font-bold">
              {compact(totals?.packets || 0)}
            </text>
            <text x={HEAD_X + HEAD_W / 2} y={BODY_CY + 13} textAnchor="middle" className="fill-muted-foreground text-[8px]">
              packets examined
            </text>
            <text x={HEAD_X + HEAD_W / 2} y={BODY_CY + 26} textAnchor="middle" className="fill-muted-foreground text-[8px]">
              {bytes(totals?.carried || 0)}
            </text>
          </g>

          {/* ── the waist: the selector layer, and the drop across it ── */}
          <g>
            <rect
              x={WAIST_X}
              y={BODY_CY - WAIST_H / 2}
              width={WAIST_W}
              height={WAIST_H}
              fill="url(#flowBody)"
              opacity={0.9}
            />
            <path
              d={`M${WAIST_X},${BODY_CY} L${ABD_X},${BODY_CY}`}
              stroke="#fff"
              strokeWidth={2}
              strokeDasharray="3 9"
              opacity={0.75}
              className="animate-flow-in motion-reduce:animate-none"
              style={{ animationDuration: "1.1s" }}
            />
            {/* Above both body segments: the waist is far narrower than this
                label, so at the waist's own height it runs over the head. */}
            <text x={WAIST_X + WAIST_W / 2} y={BODY_CY - ABD_H / 2 - 12} textAnchor="middle" className="text-[7.5px] font-bold tracking-wide" fill={MATCH}>
              YOUR WATCH LIST
            </text>
            {/* Clear of the abdomen, which overlaps the waist's own centre line. */}
            {selectivity && (
              <text
                x={WAIST_X + WAIST_W / 2}
                y={BODY_CY + ABD_H / 2 + 24}
                textAnchor="middle"
                className="fill-muted-foreground text-[8px]"
              >
                {selectivity}
              </text>
            )}
          </g>

          {/* ── 3 · abdomen: what matched ── */}
          <g>
            <ellipse
              cx={ABD_X + ABD_W / 2}
              cy={BODY_CY}
              rx={ABD_W / 2}
              ry={ABD_H / 2}
              fill="url(#flowBody)"
              stroke={MATCH}
              strokeWidth={1}
              strokeOpacity={0.55}
            />
            <ellipse
              cx={ABD_X + ABD_W / 2}
              cy={BODY_CY}
              rx={ABD_W / 2 + 7}
              ry={ABD_H / 2 + 7}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth={1}
              opacity={0.3}
              className="animate-pulse-ring motion-reduce:animate-none"
              style={{ transformOrigin: `${ABD_X + ABD_W / 2}px ${BODY_CY}px` }}
            />
            <text x={ABD_X + ABD_W / 2} y={BODY_CY - 24} textAnchor="middle" className="fill-muted-foreground text-[8px] font-semibold tracking-wide">
              MATCHES FOUND
            </text>
            <text x={ABD_X + ABD_W / 2} y={BODY_CY - 2} textAnchor="middle" className="fill-foreground text-[19px] font-bold">
              {compact(totals?.matched || 0)}
            </text>
            <text x={ABD_X + ABD_W / 2} y={BODY_CY + 11} textAnchor="middle" className="fill-muted-foreground text-[8px]">
              on your watch list
            </text>
            <text x={ABD_X + ABD_W / 2} y={BODY_CY + 25} textAnchor="middle" className="fill-muted-foreground text-[8px]">
              {compact(totals?.surfaced || 0)} alerts raised
            </text>
            <text x={ABD_X + ABD_W / 2} y={BODY_CY + 37} textAnchor="middle" className="text-[8px] font-semibold" fill="#10B981">
              {compact(totals?.subjects || 0)} people identified
            </text>
          </g>

          {/* ── 4 · silk out to the target records ── */}
          {subjects.map((s, i) => {
            const y = lane(i, subjects.length);
            const spinY = BODY_CY + (y - BODY_CY) * 0.16;
            const tone = severityColor((s.priority as Severity) || "info");
            const active = selected?.kind === "target" && selected.key === s.alias;
            const w = 0.9 + 3.4 * (s.alerts / maxAlerts);
            const d = silkPath(SPIN_X, spinY, CARD_X, y);
            const cardH = 40;
            return (
              <g
                key={s.alias}
                opacity={dim(s.alias)}
                className="cursor-pointer"
                style={{ transition: "opacity 140ms" }}
                onMouseEnter={() => setFocus({ kind: "target", key: s.alias })}
                onClick={() => onSelect?.({ kind: "target", key: s.alias })}
              >
                <title>
                  {`${s.alias}${s.subject ? ` — case ${s.subject}` : ""}\n` +
                    `${s.alerts.toLocaleString()} alerts · ${s.priority} priority\n` +
                    `Seen on ${s.links.length} monitored line${s.links.length === 1 ? "" : "s"}` +
                    (s.selectors.length ? `\nWatching for: ${s.selectors.join(", ")}` : "")}
                </title>
                <path d={d} fill="none" stroke={tone} strokeWidth={w} opacity={0.45} strokeLinecap="round" />
                <path
                  d={d}
                  fill="none"
                  stroke={tone}
                  strokeWidth={Math.min(1.4, w * 0.6)}
                  strokeDasharray="2 4"
                  opacity={0.95}
                  strokeLinecap="round"
                  className="animate-flow-in motion-reduce:animate-none"
                  style={{ animationDuration: `${(2.4 - 0.9 * (s.alerts / maxAlerts)).toFixed(2)}s` }}
                />
                <rect
                  x={CARD_X}
                  y={y - cardH / 2}
                  width={CARD_W}
                  height={cardH}
                  rx={6}
                  className="fill-card"
                  stroke={active ? tone : "currentColor"}
                  strokeWidth={active ? 1.5 : 1}
                  strokeOpacity={active ? 1 : 0.25}
                />
                <rect x={CARD_X} y={y - cardH / 2} width={3} height={cardH} rx={1.5} fill={tone} />
                <text x={CARD_X + 10} y={y - 4} className="fill-foreground text-[10px] font-semibold">
                  {truncate(s.alias, 18)}
                </text>
                <text x={CARD_X + 10} y={y + 7} className="fill-muted-foreground text-[8px]">
                  {truncate(s.subject || "—", 17)}
                </text>
                <text x={CARD_X + 10} y={y + 16} className="fill-muted-foreground/70 font-mono text-[7.5px]">
                  {s.selectors.length ? `watching ${truncate(s.selectors.join(", "), 17)}` : ""}
                </text>
                <text x={CARD_X + CARD_W - 9} y={y + 2} textAnchor="end" className="font-mono text-[11px] font-bold" fill={tone}>
                  {compact(s.alerts)}
                </text>
                <text x={CARD_X + CARD_W - 9} y={y + 12} textAnchor="end" className="fill-muted-foreground text-[7px]">
                  alerts
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-1 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-muted-foreground">
        <Legend swatch={WIRE} text="thicker leg = more traffic on that line" />
        <Legend swatch={MATCH} text="the narrow waist = your watch list filtering" />
        <Legend swatch={severityColor("high")} text="thicker thread = more alerts for that person" />
        <span className="ml-auto">
          {totals && totals.subjects > subjects.length
            ? `showing ${subjects.length} of ${totals.subjects.toLocaleString()} people identified`
            : "click a line or a person for the full story"}
        </span>
      </div>
    </div>
  );
}

function Stage({ x, label, hint }: { x: number; label: string; hint: string }) {
  return (
    <g>
      <text x={x} y={20} className="fill-foreground text-[8.5px] font-bold tracking-[0.13em]">
        {label}
      </text>
      <text x={x} y={31} className="fill-muted-foreground text-[7.5px]">
        {hint}
      </text>
    </g>
  );
}

function Legend({ swatch, text }: { swatch: string; text: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="h-1.5 w-3 rounded-sm" style={{ background: swatch, opacity: 0.75 }} />
      {text}
    </span>
  );
}
