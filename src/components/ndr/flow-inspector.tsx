"use client";

import * as React from "react";
import { Antenna, Crosshair, ShieldAlert, UserRoundSearch } from "lucide-react";
import { severityColor, type Severity } from "@/lib/types";
import { cn, relativeTime } from "@/lib/utils";
import {
  bytes,
  compact,
  STATE_META,
  type FabricData,
  type FabricLink,
  type FabricSubject,
  type FlowSelection,
} from "./interception-fabric";

const WIRE = "hsl(199 89% 48%)";
const MATCH = "#A855F7";

function pct(n: number) {
  return `${Math.max(0, Math.min(100, n)).toFixed(0)}%`;
}

/** "1 day", "3 days" — the panel is read by non-technical staff. */
function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Days between now and an ISO instant; negative once it has passed. */
function daysUntil(iso?: string) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (t - Date.now()) / 86_400_000;
}

function shortDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * The inspector for whatever the analyst clicked in the flow.
 *
 * The three lenses are navigation — they show the shape of the interception
 * and let you point at a part of it. This is the reader: one tap or one
 * target, in full, from the same joined payload the picture was drawn from.
 * Nothing here costs an extra query.
 */
export function FlowInspector({
  data,
  selection,
  onSelect,
  loading,
  className,
}: {
  data?: FabricData | null;
  selection?: FlowSelection | null;
  onSelect?: (s: FlowSelection) => void;
  loading?: boolean;
  className?: string;
}) {
  const link = React.useMemo(
    () =>
      selection?.kind === "tap"
        ? data?.links?.find((l) => l.key === selection.key)
        : undefined,
    [data, selection],
  );
  const subject = React.useMemo(
    () =>
      selection?.kind === "target"
        ? data?.subjects?.find((s) => s.alias === selection.key)
        : undefined,
    [data, selection],
  );
  const edges = data?.edges?.linkSubject || [];

  if (!selection || (!link && !subject)) {
    return (
      <div
        className={cn(
          "flex h-full items-center justify-center p-6 text-center",
          className,
        )}
      >
        <div className="text-xs text-muted-foreground">
          {loading ? (
            "Loading…"
          ) : (
            <>
              <Crosshair className="mx-auto mb-2 h-5 w-5 opacity-50" />
              Click a monitored line or a person
              <div className="mt-1 text-[10px] opacity-70">
                to see the full story behind it
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "scroll-thin flex h-full min-h-0 flex-col overflow-y-auto",
        className,
      )}
    >
      {link ? (
        <TapReport link={link} edges={edges} onSelect={onSelect} />
      ) : null}
      {subject ? (
        <TargetReport subject={subject} edges={edges} onSelect={onSelect} />
      ) : null}
    </div>
  );
}

/* ── a tap ────────────────────────────────────────────────────────────── */

function TapReport({
  link,
  edges,
  onSelect,
}: {
  link: FabricLink;
  edges: { from: string; to: string; weight: number }[];
  onSelect?: (s: FlowSelection) => void;
}) {
  const meta = STATE_META[link.state];
  const caught = edges
    .filter((e) => e.from === link.key)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 8);
  const topCaught = Math.max(1, ...caught.map((c) => c.weight));
  const perPacket =
    link.packets > 0 && link.hits > 0
      ? `1 match in every ${compact(Math.round(link.packets / link.hits))} packets`
      : null;

  return (
    <>
      <Header
        icon={Antenna}
        title={link.key}
        sub={`Monitored line · ${link.iface}`}
        chip={meta.label}
        chipColor={meta.color}
      />
      <p className="mb-3 text-[10px] leading-snug text-muted-foreground">
        {meta.blurb}
      </p>

      {/* This tap's own funnel — the same four stages the flow draws, for one leg. */}
      <Section label="What this line delivered">
        <Stage
          color={WIRE}
          label="of traffic seen"
          value={bytes(link.bytes)}
          sub={`${compact(link.packets)} packets examined`}
        />
        <Drop note={perPacket} />
        <Stage
          color={MATCH}
          label="matched your watch list"
          value={compact(link.hits)}
          sub="times a watched detail appeared"
        />
        <Drop />
        <Stage
          color="#F97316"
          label="alerts raised"
          value={compact(link.alerts)}
          sub="sent to your analysts"
        />
        <Drop />
        <Stage
          color="#10B981"
          label="people identified"
          value={compact(link.subjects)}
          sub={`from ${compact(link.selectors)} different watched details`}
        />
      </Section>

      <Section label="How productive this line is">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-lg font-bold tabular-nums">
            {compact(link.yield)}
          </span>
          <span className="text-[10px] text-muted-foreground">
            matches for every GB of traffic
          </span>
        </div>
        {link.spark.length > 1 && (
          <Spark values={link.spark} color={meta.color} />
        )}
      </Section>

      <Section label="About this line">
        <Row k="How we match" v={link.types.join(", ") || "—"} />
        <Row
          k="Traffic types seen"
          v={link.protocols.slice(0, 5).join(" · ") || "—"}
        />
        <Row
          k="SpiderX Edge"
          v={`${link.probe}${link.probeIp ? ` · ${link.probeIp}` : ""}`}
        />
      </Section>

      {caught.length > 0 && (
        <Section label={`People found on this line (${caught.length})`}>
          {caught.map((c) => (
            <button
              key={c.to}
              onClick={() => onSelect?.({ kind: "target", key: c.to })}
              className="group flex w-full items-center gap-2 rounded px-1 py-[3px] text-left hover:bg-muted/40"
            >
              <span className="w-[92px] truncate text-[10px] group-hover:text-foreground">
                {c.to}
              </span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: pct((c.weight / topCaught) * 100),
                    background: "#F97316",
                  }}
                />
              </span>
              <span className="w-9 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                {compact(c.weight)}
              </span>
            </button>
          ))}
        </Section>
      )}
    </>
  );
}

/* ── a target ─────────────────────────────────────────────────────────── */

function TargetReport({
  subject,
  edges,
  onSelect,
}: {
  subject: FabricSubject;
  edges: { from: string; to: string; weight: number }[];
  onSelect?: (s: FlowSelection) => void;
}) {
  const tone = severityColor((subject.priority as Severity) || "info");
  const t = subject.latest?.target;
  const seenOn = edges
    .filter((e) => e.to === subject.alias)
    .sort((a, b) => b.weight - a.weight);
  const topSeen = Math.max(1, ...seenOn.map((s) => s.weight));

  const left = daysUntil(t?.validTill);
  const from = t?.activeFrom ? new Date(t.activeFrom).getTime() : null;
  const till = t?.validTill ? new Date(t.validTill).getTime() : null;
  const elapsed =
    from && till && till > from
      ? ((Date.now() - from) / (till - from)) * 100
      : null;
  const lapsed = left != null && left < 0;

  return (
    <>
      <Header
        icon={UserRoundSearch}
        title={subject.alias}
        sub={
          [t?.firstName, t?.lastName].filter(Boolean).join(" ") ||
          subject.subject ||
          "—"
        }
        chip={String(subject.priority).toUpperCase()}
        chipColor={tone}
      />
      <div className="mb-3 flex items-baseline gap-2">
        <span
          className="font-mono text-xl font-bold tabular-nums"
          style={{ color: tone }}
        >
          {subject.alerts.toLocaleString()}
        </span>
        <span className="text-[10px] text-muted-foreground">
          alerts · seen on {seenOn.length} monitored line
          {seenOn.length === 1 ? "" : "s"}
        </span>
      </div>
      {subject.subject && <Row k="Case file" v={subject.subject} />}
      {t?.description && (
        <p className="mb-3 text-[10px] leading-snug text-muted-foreground">
          {t.description}
        </p>
      )}

      {/* Authority is the one clock on this page that has legal weight, so it
          gets a bar rather than a date the reader has to do arithmetic on. */}
      {left != null && (
        <Section label="Legal authority to monitor">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span
              className="text-[11px] font-semibold"
              style={{
                color: lapsed
                  ? severityColor("critical")
                  : left < 7
                    ? "#F59E0B"
                    : "#10B981",
              }}
            >
              {lapsed
                ? `Expired ${plural(Math.abs(Math.round(left)), "day")} ago`
                : `${plural(Math.round(left), "day")} left`}
            </span>
            <span className="text-[9px] text-muted-foreground">
              {shortDate(t?.activeFrom)} → {shortDate(t?.validTill)}
            </span>
          </div>
          {elapsed != null && (
            <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full"
                style={{
                  width: pct(elapsed),
                  background: lapsed
                    ? severityColor("critical")
                    : left < 7
                      ? "#F59E0B"
                      : "#10B981",
                }}
              />
            </span>
          )}
        </Section>
      )}

      <Section label="What we are watching for">
        <Row
          k="Details we watch for"
          v={(t?.targetValue || subject.selectors).join(", ") || "—"}
        />
        <Row k="How we match" v={subject.latest?.protocol || "—"} />
        <Row
          k="What we record"
          v={(t?.captureAction || []).join(" · ") || "—"}
        />
        <Row
          k="Currently active"
          v={t?.enabled == null ? "—" : t.enabled ? "Yes" : "No"}
        />
      </Section>

      {seenOn.length > 0 && (
        <Section label={`Seen on these lines (${seenOn.length})`}>
          {seenOn.map((s) => (
            <button
              key={s.from}
              onClick={() => onSelect?.({ kind: "tap", key: s.from })}
              className="group flex w-full items-center gap-2 rounded px-1 py-[3px] text-left hover:bg-muted/40"
            >
              <span className="w-[92px] truncate text-[10px] group-hover:text-foreground">
                {s.from}
              </span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: pct((s.weight / topSeen) * 100),
                    background: tone,
                  }}
                />
              </span>
              <span className="w-9 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                {compact(s.weight)}
              </span>
            </button>
          ))}
        </Section>
      )}

      <Section label="Record history">
        <Row k="Created by" v={t?.createdBy || "—"} />
        <Row k="Modified by" v={t?.lastModifiedBy || "—"} />
        <Row k="Added in batch" v={t?.importName || "—"} />
      </Section>

      {subject.latest && (
        <Section label="Most recent alert">
          <div className="mb-1 flex items-center gap-1.5">
            <ShieldAlert className="h-3 w-3 shrink-0" style={{ color: tone }} />
            <span className="truncate text-[11px] font-semibold">
              {subject.latest.title}
            </span>
          </div>
          <Row k="When" v={relativeTime(subject.latest.ts)} />
          <Row k="What matched" v={subject.latest.value || "—"} />
          <Row k="On which line" v={subject.latest.link_name || "—"} />
          <Row
            k="Which SpiderX Edge"
            v={subject.latest.probe_host_name || "—"}
          />
          <Row k="Stored in" v={subject.latest.index || "—"} />
          <Row k="Record reference" v={subject.latest.id} />
        </Section>
      )}
    </>
  );
}

/* ── pieces ───────────────────────────────────────────────────────────── */

function Header({
  icon: Icon,
  title,
  sub,
  chip,
  chipColor,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  sub: string;
  chip: string;
  chipColor: string;
}) {
  return (
    <div className="mb-2 flex items-start gap-2">
      <span className="mt-0.5 shrink-0 rounded-md bg-muted p-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold leading-tight">
          {title}
        </div>
        <div className="truncate text-[10px] text-muted-foreground">{sub}</div>
      </div>
      <span
        className="shrink-0 rounded px-1.5 py-0.5 text-[8.5px] font-bold"
        style={{ color: chipColor, background: `${chipColor}22` }}
      >
        {chip}
      </span>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3 border-t border-border/50 pt-2">
      <div className="eyebrow mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-[2px]">
      <span className="shrink-0 text-[10px] text-muted-foreground">{k}</span>
      <span
        className={cn(
          "truncate text-right text-[10px]",
          mono && "font-mono text-[9.5px]",
        )}
        title={v}
      >
        {v}
      </span>
    </div>
  );
}

function Stage({
  color,
  label,
  value,
  sub,
}: {
  color: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-6 w-0.5 shrink-0 rounded"
        style={{ background: color }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-[13px] font-bold tabular-nums">
            {value}
          </span>
          <span className="text-[10px] text-muted-foreground">{label}</span>
        </div>
        <div className="truncate text-[9px] text-muted-foreground/80">
          {sub}
        </div>
      </div>
    </div>
  );
}

/** The connector between two stages, carrying the drop across it. */
function Drop({ note }: { note?: string | null }) {
  return (
    <div className="ml-[1px] flex items-center gap-2 py-0.5">
      <span className="h-3 w-px shrink-0 bg-border" />
      {note && (
        <span className="text-[9px] text-muted-foreground/80">{note}</span>
      )}
    </div>
  );
}

function Spark({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  const step = 100 / Math.max(1, values.length - 1);
  const pts = values
    .map((v, i) => `${i * step},${20 - (v / max) * 18}`)
    .join(" ");
  return (
    <svg
      viewBox="0 0 100 20"
      preserveAspectRatio="none"
      className="mt-1.5 h-6 w-full"
    >
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
