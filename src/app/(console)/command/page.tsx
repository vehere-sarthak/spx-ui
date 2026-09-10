"use client";

import { apiFetch } from "@/lib/api-client";
import * as React from "react";
import { CalendarX2, Radar, ShieldAlert, UserRoundSearch } from "lucide-react";
import {
  InterceptionFabric,
  type FabricData,
  type FlowSelection,
} from "@/components/ndr/interception-fabric";
import { SpiderWeb } from "@/components/ndr/spider-web";
import { SpiderxFlow } from "@/components/ndr/spiderx-flow";
import { type CadenceBucket } from "@/components/ndr/threat-cadence";
import { type ThreadHop } from "@/components/ndr/golden-thread";
import { FlowInspector } from "@/components/ndr/flow-inspector";
import { CorrelationKey } from "@/components/ndr/correlation-key";
import { Card, CardContent } from "@/components/ui/card";
import type { Detection, Severity } from "@/lib/types";
import { PageFrame } from "@/components/ndr/page-frame";
import { DateRangeBar, useDateRange } from "@/components/ndr/date-range-bar";
import { CmsSoiDashboard } from "@/components/ndr/cms-soi-dashboard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
    rows?: {
      key: string;
      band: "encap" | "protocol";
      total: number;
      values: number[];
    }[];
  };
  trend?: { timeline?: { t: string; count: number }[] };
  offenders?: {
    offenders?: {
      key: string;
      doc_count: number;
      severity?: Severity;
      latest?: Detection | null;
    }[];
    links?: { key: string; doc_count: number }[];
  };
  recent?: { items?: Detection[]; total?: number; priority?: string | null };
  meta?: { es_host?: string; interval?: string };
  error?: string;
};

export default function CommandPage() {
  const [data, setData] = React.useState<CommandPayload | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [inspect, setInspect] = React.useState<FlowSelection | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [range, setRange] = useDateRange("now-7d");
  const [view, setView] = React.useState<"command" | "cms">("command");
  const [fabric, setFabric] = React.useState<FabricData | null>(null);
  // Same join, two readings: the web is the product's own shape, the fabric is
  // the same chain laid out as columns when the numbers matter more.
  const [lens, setLens] = React.useState<"flow" | "web" | "fabric">("flow");

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
      const params = new URLSearchParams({
        startTime: range.startTime,
        endTime: range.endTime,
      });
      const [res, fabricRes] = await Promise.all([
        apiFetch(`/ndr/command?${params}`, { cache: "no-store" }),
        // The fabric joins link-stats, soi-stats and the alerts index on
        // `link_name`.
        apiFetch(
          `/ndr/fabric?startTime=${encodeURIComponent(range.startTime)}&endTime=${encodeURIComponent(range.endTime)}`,
          { cache: "no-store" },
        ).catch(() => null),
      ]);
      const json = (await res.json()) as CommandPayload;
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setData(json);
      if (fabricRes?.ok) {
        const f = (await fabricRes.json()) as FabricData;
        setFabric(f);
        // Open on the busiest tap rather than an empty panel, and drop a
        // selection whose subject fell out of the new window.
        setInspect((cur) => {
          const stillThere =
            cur?.kind === "tap"
              ? f.links?.some((l) => l.key === cur.key)
              : cur?.kind === "target"
                ? f.subjects?.some((s) => s.alias === cur.key)
                : false;
          if (cur && stillThere) return cur;
          return f.links?.[0] ? { kind: "tap", key: f.links[0].key } : null;
        });
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [range, view]);

  React.useEffect(() => {
    if (view !== "command") return;
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load, view]);

  const kpi = data?.kpi;

  return (
    <PageFrame
      title="Command Center"
      actions={
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <Select
            value={view}
            onValueChange={(v) => setView(v as "command" | "cms")}
          >
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
              <DateRangeBar
                value={range}
                onChange={setRange}
                presets={["now-1h", "now-1d", "now-7d", "now-30d", "custom"]}
              />
              {data?.meta?.es_host && (
                <span className="ndr-inset px-2 py-1">
                  ES · {esLabel(data.meta.es_host)}
                </span>
              )}
              {loading && (
                <span className="ndr-inset px-2 py-1 text-primary">
                  Refreshing…
                </span>
              )}
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
            <div className="shrink-0 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
              {error}
            </div>
          )}

          {/* Three lanes that each own their own scroll: the page itself never
          grows past the viewport. The web is the middle and the widest,
          because it is the thing being read. */}
          <div className="grid min-h-0 flex-1 gap-3 overflow-hidden xl:grid-cols-[minmax(200px,0.78fr)_minmax(420px,2.2fr)_minmax(250px,1.05fr)]">
            <div className="scroll-thin flex min-h-0 flex-col gap-3 overflow-y-auto">
              <Stat
                icon={UserRoundSearch}
                label="People being monitored"
                value={
                  kpi?.targets_active != null
                    ? kpi.targets_active.toLocaleString()
                    : loading
                      ? "…"
                      : "0"
                }
                hint={`${(kpi?.targets_total ?? 0).toLocaleString()} on file in total`}
                tone="ok"
              />
              <Stat
                icon={Radar}
                label="Seen on the network"
                value={
                  kpi?.subjects_in_play != null
                    ? kpi.subjects_in_play.toLocaleString()
                    : loading
                      ? "…"
                      : "0"
                }
                hint={coverageHint(kpi?.subjects_in_play, kpi?.targets_active)}
              />
              <Stat
                icon={ShieldAlert}
                label="Alerts raised"
                value={
                  kpi?.alerts_total != null
                    ? kpi.alerts_total.toLocaleString()
                    : loading
                      ? "…"
                      : "0"
                }
                hint={`${(kpi?.high ?? 0).toLocaleString()} high priority · ${(kpi?.medium ?? 0).toLocaleString()} medium`}
                tone="critical"
              />
              <Stat
                icon={CalendarX2}
                label="Authority expiring"
                value={
                  kpi?.targets_expiring_24h != null
                    ? kpi.targets_expiring_24h.toLocaleString()
                    : loading
                      ? "…"
                      : "0"
                }
                hint={`in the next 24 hours · ${(kpi?.targets_expired ?? 0).toLocaleString()} already expired`}
              />
              {/* Fills the rest of the lane, and states outright what the three
              measurements on this page have to do with each other. */}
              <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
                <CorrelationKey data={fabric} loading={loading} />
              </Card>
            </div>

            <Card className="flex min-h-0 flex-col overflow-hidden p-4">
              <div className="mb-2 flex shrink-0 items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold">
                    {lens === "flow"
                      ? "How SpiderX found them"
                      : lens === "web"
                        ? "How SpiderX found them"
                        : "How SpiderX found them"}
                  </h2>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {lens === "flow"
                      ? "Traffic on your lines → examined by SpiderX → matched your watch list → identified as a person"
                      : lens === "web"
                        ? "Traffic arrives at the outer edge · SpiderX matches in the middle · the people it found hang where they were caught"
                        : "SpiderX Edge, line and person side by side · what each line carried against what it found"}
                  </p>
                </div>
                <div className="flex shrink-0 rounded-md border border-border/60 p-0.5">
                  {(["flow", "web", "fabric"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setLens(mode)}
                      title={LENS_HELP[mode]}
                      className={
                        "rounded px-1.5 py-0.5 text-[10px] transition " +
                        (lens === mode
                          ? "bg-primary/15 font-semibold text-primary"
                          : "text-muted-foreground hover:text-foreground")
                      }
                    >
                      {LENS_LABEL[mode]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="min-h-0 flex-1">
                {lens === "flow" ? (
                  <SpiderxFlow
                    data={fabric}
                    loading={loading}
                    selected={inspect}
                    onSelect={setInspect}
                  />
                ) : lens === "web" ? (
                  <SpiderWeb
                    data={fabric}
                    loading={loading}
                    selected={inspect}
                    onSelect={setInspect}
                  />
                ) : (
                  <InterceptionFabric
                    data={fabric}
                    loading={loading}
                    selected={inspect}
                    onSelect={setInspect}
                  />
                )}
              </div>
            </Card>

            <Card className="flex min-h-0 flex-col overflow-hidden p-3">
              <FlowInspector
                data={fabric}
                selection={inspect}
                onSelect={setInspect}
                loading={loading}
              />
            </Card>
          </div>
        </div>
      )}
    </PageFrame>
  );
}

/** The three drawings are one dataset; only the shape changes. */
const LENS_LABEL: Record<"flow" | "web" | "fabric", string> = {
  flow: "Flow",
  web: "Web",
  fabric: "Side by side",
};

const LENS_HELP: Record<"flow" | "web" | "fabric", string> = {
  flow: "The journey, left to right: traffic in, matches found, people identified",
  web: "The same journey drawn as a web, with SpiderX at the centre",
  fabric:
    "The same information as plain columns, easiest to compare line by line",
};

/** Share of the people being monitored who actually appeared this period. */
function coverageHint(inPlay?: number, active?: number) {
  if (!inPlay || !active) return "of the people being monitored";
  return `${((inPlay / active) * 100).toFixed(1)}% of those being monitored`;
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
          <div className="eyebrow">{label}</div>
          <div className="display-figure my-1 text-[24px] leading-none">
            {value}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {hint}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
