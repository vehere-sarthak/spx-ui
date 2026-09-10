"use client";

import { apiFetch } from "@/lib/api-client";
import * as React from "react";
import { ChartPanel, MiniBars, SparkArea, RingMix } from "@/components/ndr/charts";
import { DateRangeBar, useDateRange } from "@/components/ndr/date-range-bar";
import {
  AdvancedFilterPanel,
  AdvancedRule,
  rulesToQuery,
  selectedParam,
} from "@/components/ndr/advanced-filter-panel";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { countryName } from "@/lib/country-names";

type Overview = {
  kpi?: {
    totalSoi?: number;
    totalHits?: number;
    highAlerts?: number;
    criticalAlerts?: number;
    alertsTotal?: number;
    activeSpiderX?: number;
  };
  severity?: { key: string; count: number; hits?: number }[];
  timeline?: { t: string; count: number; hits?: number }[];
  countries?: { key: string; count: number; hits?: number }[];
  types?: { key: string; count: number; hits?: number }[];
  links?: { key: string; count: number; hits?: number }[];
  aliases?: { key: string; count: number; hits?: number }[];
  hosts?: { key: string; count: number; hits?: number }[];
  protocols?: { key: string; count: number; hits?: number }[];
  topAlerts?: {
    key: string;
    count: number;
    priority?: string;
    probe?: string;
    link?: string;
    type?: string;
  }[];
};

const SEV_COLORS: Record<string, string> = {
  critical: "#E11D2E",
  high: "#F97316",
  medium: "#EAB308",
  low: "#3B82F6",
};

export function CmsSoiDashboard() {
  const [range, setRange] = useDateRange("now-8h");
  const [priority, setPriority] = React.useState<string[]>(["all"]);
  const [type, setType] = React.useState<string[]>(["all"]);
  const [probe, setProbe] = React.useState<string[]>(["all"]);
  const [link, setLink] = React.useState<string[]>(["all"]);
  const [country, setCountry] = React.useState<string[]>(["all"]);
  const [protocol, setProtocol] = React.useState<string[]>(["all"]);
  const [rules, setRules] = React.useState<AdvancedRule[]>([]);
  const [filterOpen, setFilterOpen] = React.useState(true);
  const [q, setQ] = React.useState("");
  const [data, setData] = React.useState<Overview | null>(null);
  const [facetCache, setFacetCache] = React.useState<Overview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        startTime: range.startTime,
        endTime: range.endTime,
        priority: selectedParam(priority),
        type: selectedParam(type),
        probe: selectedParam(probe),
        link: selectedParam(link),
        country: selectedParam(country),
        protocol: selectedParam(protocol),
      });
      if (q.trim()) params.set("query", q.trim());
      const adv = rulesToQuery(rules);
      if (adv) params.set("advanced", adv);
      const res = await apiFetch(`/dashboard/cms/soi/overview?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setData(json);
      setFacetCache((prev) => prev || json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [range, priority, type, probe, link, country, protocol, rules, q]);

  React.useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  function resetFilters() {
    setPriority(["all"]);
    setType(["all"]);
    setProbe(["all"]);
    setLink(["all"]);
    setCountry(["all"]);
    setProtocol(["all"]);
    setRules([]);
    setQ("");
  }

  const facets = facetCache || data;
  const kpi = data?.kpi;
  const sevSlices = (data?.severity || []).map((s) => ({
    name: s.key,
    value: s.hits || s.count,
    color: SEV_COLORS[String(s.key).toLowerCase()] || "#94A3B8",
  }));
  const timeline = data?.timeline || [];
  const timelineLabels = timeline.map((t) => {
    try {
      return new Date(t.t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit" });
    } catch {
      return t.t;
    }
  });

  return (
    <div className="flex h-full min-h-0 gap-3 overflow-hidden">
      <AdvancedFilterPanel
        open={filterOpen}
        onOpenChange={setFilterOpen}
        groups={[
          {
            id: "priority",
            label: "Severity",
            selected: priority,
            onChange: setPriority,
            options: (facets?.severity || []).map((x) => ({
              key: String(x.key),
              label: String(x.key),
              count: x.count,
            })),
          },
          {
            id: "type",
            label: "SOI type",
            selected: type,
            onChange: setType,
            options: (facets?.types || []).map((x) => ({
              key: String(x.key),
              label: String(x.key),
              count: x.count,
            })),
          },
          {
            id: "probe",
            label: "SpiderX probe",
            selected: probe,
            onChange: setProbe,
            options: (facets?.hosts || []).map((x) => ({
              key: String(x.key),
              label: String(x.key),
              count: x.count,
            })),
          },
          {
            id: "country",
            label: "Country",
            selected: country,
            onChange: setCountry,
            options: (facets?.countries || []).map((x) => ({
              key: String(x.key),
              label: String(x.key),
              count: x.count,
            })),
          },
          {
            id: "protocol",
            label: "Protocol",
            selected: protocol,
            onChange: setProtocol,
            options: (facets?.protocols || []).map((x) => ({
              key: String(x.key),
              label: String(x.key),
              count: x.count,
            })),
          },
          {
            id: "link",
            label: "Link",
            selected: link,
            onChange: setLink,
            options: (facets?.links || []).map((x) => ({
              key: String(x.key),
              label: String(x.key),
              count: x.count,
            })),
          },
        ]}
        advancedFields={[
          { id: "priority", label: "Severity" },
          { id: "type", label: "SOI type" },
          { id: "probe_host_name", label: "Probe host" },
          { id: "probe_ip", label: "Probe IP" },
          { id: "countries_a2_codes", label: "Country" },
          { id: "protocols", label: "Protocol" },
          { id: "link_name", label: "Link name" },
          { id: "value", label: "SOI value" },
          { id: "ref_id", label: "Reference ID" },
        ]}
        rules={rules}
        onRulesChange={setRules}
        onReset={resetFilters}
        onApply={load}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <DateRangeBar
            value={range}
            onChange={setRange}
            presets={["now-1h", "now-8h", "now-1d", "now-7d", "now-30d", "custom"]}
          />
          <Input
            className="h-9 max-w-[220px]"
            placeholder="Search SOI…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {loading && <span className="text-[11px] text-muted-foreground">Refreshing…</span>}
        </div>

        {error && (
          <div className="shrink-0 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
            {error}
          </div>
        )}

        <div className="grid shrink-0 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Total SOI" value={kpi?.totalSoi} rule="bg-sky-500" />
          <Kpi label="Total hits" value={kpi?.totalHits} rule="bg-emerald-500" />
          <Kpi
            label="High alerts"
            value={kpi?.highAlerts}
            hint={`Critical ${kpi?.criticalAlerts ?? 0}`}
            rule="bg-orange-500"
          />
          <Kpi label="Active SpiderX" value={kpi?.activeSpiderX} rule="bg-violet-500" />
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-auto scroll-thin pb-2">
          <div className="grid gap-3 xl:grid-cols-3">
            <ChartPanel title="Hits over time" className="xl:col-span-2" height="h-64">
              {timeline.length ? (
                <SparkArea
                  values={timeline.map((t) => t.hits || t.count)}
                  labels={timelineLabels}
                />
              ) : (
                <Empty />
              )}
            </ChartPanel>
            <ChartPanel title="Severity mix" height="h-64">
              {sevSlices.length ? <RingMix slices={sevSlices} /> : <Empty />}
            </ChartPanel>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <ChartPanel title="SpiderX vs hits" height="h-60">
              <Bars data={data?.hosts} />
            </ChartPanel>
            <ChartPanel title="Type vs hits" height="h-60">
              <Bars data={data?.types} />
            </ChartPanel>
            <ChartPanel title="SOI aliases" height="h-60">
              <Bars data={data?.aliases} />
            </ChartPanel>
            <ChartPanel title="Country vs hits" height="h-60">
              <Bars
                data={(data?.countries || []).map((c) => ({ ...c, key: countryName(String(c.key)) }))}
              />
            </ChartPanel>
            <ChartPanel title="Link activity" height="h-60">
              <Bars data={data?.links} />
            </ChartPanel>
          </div>

          <ChartPanel title="Top active alerts" height="h-96">
            {(data?.topAlerts || []).length ? (
              <div className="h-full overflow-auto scroll-thin">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 bg-card text-[10px] uppercase text-muted-foreground">
                    <tr>
                      <th className="py-1.5 pr-2 text-left font-medium">Priority</th>
                      <th className="py-1.5 pr-2 text-left font-medium">Alert</th>
                      <th className="py-1.5 pr-2 text-left font-medium">Spider-X</th>
                      <th className="py-1.5 pr-2 text-left font-medium">Link</th>
                      <th className="py-1.5 text-right font-medium">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.topAlerts || []).map((a) => (
                      <tr key={a.key} className="border-t border-border/40">
                        <td className="py-1.5 pr-2">
                          <span
                            className="inline-flex items-center gap-1.5 capitalize"
                            style={{ color: SEV_COLORS[a.priority || ""] || "#94A3B8" }}
                          >
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: SEV_COLORS[a.priority || ""] || "#94A3B8" }}
                            />
                            {a.priority || "info"}
                          </span>
                        </td>
                        <td className="max-w-[260px] truncate py-1.5 pr-2" title={String(a.key)}>
                          {a.key}
                        </td>
                        <td className="max-w-[140px] truncate py-1.5 pr-2">{a.probe || "-"}</td>
                        <td className="max-w-[180px] truncate py-1.5 pr-2">{a.link || "-"}</td>
                        <td className="py-1.5 text-right font-mono tabular-nums">{a.count.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty />
            )}
          </ChartPanel>
        </div>
      </div>
    </div>
  );
}

function Bars({ data }: { data?: { key: string; count: number; hits?: number }[] }) {
  const rows = (data || []).slice(0, 8);
  if (!rows.length) return <Empty />;
  return (
    <MiniBars
      horizontal
      className="h-full"
      data={rows.map((d) => ({ label: String(d.key), value: d.hits || d.count }))}
    />
  );
}

function Empty() {
  return <p className="flex h-full items-center justify-center text-xs text-muted-foreground">No data in range</p>;
}

function Kpi({
  label,
  value,
  hint,
  rule,
}: {
  label: string;
  value?: number;
  hint?: string;
  /** Colour is carried by a short rule above the figure, not a wash behind it. */
  rule: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-3.5 py-3">
      <div className={cn("mb-2 h-[2px] w-6 rounded-full", rule)} />
      <div className="eyebrow">{label}</div>
      <div className="display-figure mt-1 text-[26px] leading-none">
        {value != null ? Number(value).toLocaleString() : "—"}
      </div>
      {hint && <div className="mt-1 text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
