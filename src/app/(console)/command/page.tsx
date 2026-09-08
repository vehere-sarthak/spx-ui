"use client";

import { apiFetch } from "@/lib/api-client";
import * as React from "react";
import { CalendarX2, Radar, ShieldAlert, UserRoundSearch } from "lucide-react";
import { ThreatOrbit } from "@/components/ndr/threat-orbit";
import { TargetDossier } from "@/components/ndr/target-dossier";
import { ThreatCadence, type CadenceBucket } from "@/components/ndr/threat-cadence";
import { SignalWaterfall, WireLegend, type WaterfallRow } from "@/components/ndr/signal-waterfall";
import { GoldenThread, type ThreadHop } from "@/components/ndr/golden-thread";
import { Card, CardContent } from "@/components/ui/card";
import type { Detection, Severity } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { PageFrame } from "@/components/ndr/page-frame";
import { DateRangeBar, useDateRange } from "@/components/ndr/date-range-bar";
import { CmsSoiDashboard } from "@/components/ndr/cms-soi-dashboard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type CommandPayload = {
  kpi?: {
    alerts_total?: number;
    critical?: number;
    high?: number;
    medium?: number;
    low?: number;
    soi_hits?: number;
    links?: number;
    link_bytes?: number;
    targets_total?: number;
    targets_enabled?: number;
    targets_active?: number;
    targets_expired?: number;
    targets_expiring_24h?: number;
    subjects_total?: number;
    subjects_in_play?: number;
  };
  thread?: ThreadHop[];
  subjects?: {
    interval?: string;
    buckets?: string[];
    rows?: {
      alias: string;
      subject?: string | null;
      priority?: Severity;
      total: number;
      links?: number;
      values: number[];
      latest?: Detection | null;
    }[];
  };
  cadence?: { interval?: string; buckets?: CadenceBucket[] };
  spectrum?: {
    interval?: string;
    buckets?: string[];
    rows?: { key: string; band: "encap" | "protocol"; total: number; values: number[] }[];
  };
  trend?: { timeline?: { t: string; count: number }[] };
  offenders?: {
    offenders?: { key: string; doc_count: number; severity?: Severity; latest?: Detection | null }[];
    links?: { key: string; doc_count: number }[];
  };
  recent?: { items?: Detection[]; total?: number; priority?: string | null };
  meta?: { es_host?: string; interval?: string };
  error?: string;
};

export default function CommandPage() {
  const [data, setData] = React.useState<CommandPayload | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Detection | null>(null);
  const [priority, setPriority] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [range, setRange] = useDateRange("now-7d");
  const [view, setView] = React.useState<"command" | "cms">("command");
  const [lens, setLens] = React.useState<"subjects" | "wire">("subjects");

  React.useEffect(() => {
    try {
      const v = new URLSearchParams(window.location.search).get("view");
      if (v === "cms") setView("cms");
    } catch {
      /* ignore */
    }
  }, []);

  const load = React.useCallback(async () => {
    if (view !== "command") return;
    try {
      setLoading(true);
      const params = new URLSearchParams({ startTime: range.startTime, endTime: range.endTime });
      if (priority) params.set("priority", priority);
      const res = await apiFetch(`/ndr/command?${params}`, { cache: "no-store" });
      const json = (await res.json()) as CommandPayload;
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setData(json);
      setSelected((cur) => {
        const items = json.recent?.items || [];
        if (cur && items.some((d) => d.id === cur.id)) return cur;
        return items[0] || null;
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [range, view, priority]);

  React.useEffect(() => {
    if (view !== "command") return;
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load, view]);

  const kpi = data?.kpi;
  const detections = data?.recent?.items || [];
  const subjectRows = data?.subjects?.rows || [];

  // Subjects first: the alias the analyst typed is the label, the case they
  // filed it under is the second line. The wire lens keeps the protocol view
  // underneath for when the question is "did the probe see anything at all".
  const waterfall: { buckets: string[]; rows: WaterfallRow[]; unit: string; empty: string } =
    lens === "subjects"
      ? {
          buckets: data?.subjects?.buckets || [],
          unit: "alerts",
          empty: "No target matched in this window",
          rows: subjectRows.map((r) => ({
            key: r.alias,
            label: r.alias,
            sublabel: r.subject || undefined,
            tone: r.priority || "info",
            total: r.total,
            values: r.values,
            meta: r.links ? `${r.links} link${r.links === 1 ? "" : "s"}` : undefined,
          })),
        }
      : {
          buckets: data?.spectrum?.buckets || [],
          unit: "pkts",
          empty: "No protocol counters in this window",
          rows: (data?.spectrum?.rows || []).map((r) => ({
            key: `${r.band}:${r.key}`,
            label: r.key,
            tone: r.band,
            total: r.total,
            values: r.values,
          })),
        };

  const priorityBuckets = [
    { key: "critical", count: kpi?.critical || 0 },
    { key: "high", count: kpi?.high || 0 },
    { key: "medium", count: kpi?.medium || 0 },
    { key: "low", count: kpi?.low || 0 },
  ];

  return (
    <PageFrame
      title="Command Center"
      subtitle={view === "cms" ? "SOI CMS dashboard (vehere-ui parity)" : "Operational command view"}
      actions={
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <Select value={view} onValueChange={(v) => setView(v as "command" | "cms")}>
            <SelectTrigger className="h-9 w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="command">Command view</SelectItem>
              <SelectItem value="cms">SOI CMS dashboard</SelectItem>
            </SelectContent>
          </Select>
          {view === "command" && (
            <>
              <DateRangeBar value={range} onChange={setRange} presets={["now-1h", "now-1d", "now-7d", "now-30d", "custom"]} />
              {data?.meta?.es_host && (
                <span className="ndr-inset px-2 py-1">ES · {esLabel(data.meta.es_host)}</span>
              )}
              {loading && <span className="ndr-inset px-2 py-1 text-primary">Refreshing…</span>}
            </>
          )}
        </div>
      }
    >
      {view === "cms" ? (
        <CmsSoiDashboard />
      ) : (
      <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      {error && (
        <div className="shrink-0 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">{error}</div>
      )}

      <div className="grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={UserRoundSearch}
          label="Targets under interception"
          value={kpi?.targets_active != null ? kpi.targets_active.toLocaleString() : loading ? "…" : "0"}
          hint={`${(kpi?.targets_total ?? 0).toLocaleString()} on file · ${(kpi?.subjects_total ?? 0).toLocaleString()} subjects`}
          tone="ok"
        />
        <Stat
          icon={Radar}
          label="Subjects in play"
          value={kpi?.subjects_in_play != null ? kpi.subjects_in_play.toLocaleString() : loading ? "…" : "0"}
          hint={coverageHint(kpi?.subjects_in_play, kpi?.targets_active)}
        />
        <Stat
          icon={ShieldAlert}
          label="Alerts raised"
          value={kpi?.alerts_total != null ? kpi.alerts_total.toLocaleString() : loading ? "…" : "0"}
          hint={`${(kpi?.high ?? 0).toLocaleString()} high · ${(kpi?.medium ?? 0).toLocaleString()} medium`}
          tone="critical"
        />
        <Stat
          icon={CalendarX2}
          label="Authority expiring"
          value={
            kpi?.targets_expiring_24h != null ? kpi.targets_expiring_24h.toLocaleString() : loading ? "…" : "0"
          }
          hint={`next 24h · ${(kpi?.targets_expired ?? 0).toLocaleString()} already lapsed`}
        />
      </div>

      <div className="shrink-0">
        <GoldenThread hops={data?.thread} loading={loading} />
      </div>

      <div className="shrink-0">
        <ThreatCadence
          buckets={data?.cadence?.buckets}
          totals={priorityBuckets}
          active={priority}
          onSelect={(s) => setPriority((cur) => (cur === s ? null : s))}
          interval={data?.cadence?.interval}
          loading={loading}
        />
      </div>

      <div className="grid min-h-0 flex-1 gap-3 overflow-hidden xl:grid-cols-[minmax(260px,1fr)_minmax(280px,1.1fr)_minmax(260px,1fr)]">
        <Card className="flex min-h-0 flex-col overflow-hidden p-4">
          <div className="mb-2 flex shrink-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">
                {lens === "subjects" ? "Subject Activity" : "Wire Spectrum"}
              </h2>
              <p className="truncate text-[11px] text-muted-foreground">
                {lens === "subjects"
                  ? "logvehere-alerts-* · the analyst's own aliases, over time"
                  : "link-stats-* · protocol counters underneath the hits"}
              </p>
            </div>
            <div className="flex shrink-0 rounded-md border border-border/60 p-0.5">
              {(["subjects", "wire"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setLens(mode)}
                  className={
                    "rounded px-1.5 py-0.5 text-[10px] capitalize transition " +
                    (lens === mode
                      ? "bg-primary/15 font-semibold text-primary"
                      : "text-muted-foreground hover:text-foreground")
                  }
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <SignalWaterfall
              buckets={waterfall.buckets}
              rows={waterfall.rows}
              interval={data?.subjects?.interval}
              unit={waterfall.unit}
              emptyLabel={waterfall.empty}
              loading={loading}
              legend={lens === "wire" ? <WireLegend /> : undefined}
              selectedKey={lens === "subjects" ? selected?.target?.alias : undefined}
              onSelect={
                lens === "subjects"
                  ? (key) => {
                      const row = subjectRows.find((r) => r.alias === key);
                      if (row?.latest) setSelected(row.latest);
                    }
                  : undefined
              }
            />
          </div>
        </Card>

        <Card className="flex min-h-0 flex-col overflow-auto scroll-thin p-4">
          <div className="mb-2 shrink-0">
            <h2 className="text-sm font-semibold">Subject Orbit</h2>
            <p className="text-[11px] text-muted-foreground">
              Busiest aliases this window · closer to core = more alerts
            </p>
          </div>
          {/* pt clears the outer ring's tick label from the panel subtitle. */}
          <div className="flex min-h-0 flex-1 items-center justify-center pt-2">
            <ThreatOrbit
              nodes={subjectRows.slice(0, 8).map((r) => ({
                id: r.alias,
                label: r.alias.length > 14 ? `${r.alias.slice(0, 13)}…` : r.alias,
                count: r.total,
                severity: r.priority || "info",
              }))}
              selected={selected?.target?.alias}
              onSelect={(id) => {
                // The alias's own newest document, so a node outside the last 20
                // alerts still opens a dossier.
                const row = subjectRows.find((r) => r.alias === id);
                const hit = row?.latest || detections.find((d) => d.target?.alias === id);
                if (hit) setSelected(hit);
              }}
            />
          </div>
          {/* One scrolling row — wrapping these pushed them over the orbit caption. */}
          <div className="scroll-thin mt-2 flex shrink-0 gap-1 overflow-x-auto pb-1">
            {(data?.offenders?.links || []).slice(0, 8).map((l) => (
              <Badge key={l.key} variant="secondary" className="shrink-0 whitespace-nowrap">
                {l.key} · {l.doc_count.toLocaleString()}
              </Badge>
            ))}
          </div>
        </Card>

        <Card className="min-h-0 overflow-hidden">
          <TargetDossier detection={selected} />
        </Card>
      </div>
      </div>
      )}
    </PageFrame>
  );
}

/** Share of the armed watchlist that actually produced a hit this window. */
function coverageHint(inPlay?: number, active?: number) {
  if (!inPlay || !active) return "aliases seen on the wire";
  return `${((inPlay / active) * 100).toFixed(1)}% of the armed watchlist`;
}

/** Host:port of the configured ES endpoint, without the scheme. */
function esLabel(host: string) {
  try {
    return new URL(host).host;
  } catch {
    return host.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  tone?: "critical" | "ok";
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <span
          className={
            tone === "critical"
              ? "rounded-md bg-primary/15 p-2 text-primary"
              : tone === "ok"
                ? "rounded-md bg-severity-success/15 p-2 text-severity-success"
                : "rounded-md bg-muted p-2 text-muted-foreground"
          }
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground">{label}</div>
          <div className="text-xl font-semibold tracking-tight">{value}</div>
          <div className="truncate text-[11px] text-muted-foreground">{hint}</div>
        </div>
      </CardContent>
    </Card>
  );
}
