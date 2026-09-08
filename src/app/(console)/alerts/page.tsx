"use client";

import { apiFetch, apiUrl } from "@/lib/api-client";
import * as React from "react";
import { Download, Flag, Search, Tag } from "lucide-react";
import type { Detection } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InvestigationDock } from "@/components/ndr/investigation-dock";
import { HexBufferViewer } from "@/components/ndr/hex-buffer-viewer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageFrame } from "@/components/ndr/page-frame";
import { DateRangeBar, useDateRange } from "@/components/ndr/date-range-bar";
import { PaginationBar } from "@/components/ndr/pagination-bar";
import { ChartPanel, MiniBars, SparkArea } from "@/components/ndr/charts";
import {
  AdvancedFilterPanel,
  AdvancedRule,
  rulesToQuery,
  selectedParam,
} from "@/components/ndr/advanced-filter-panel";
import { readSessionUser } from "@/lib/session";
import { relativeTime, cn } from "@/lib/utils";

type ViewMode = "grid" | "summary";

type AlertSummary = {
  kpi?: { total?: number; flagged?: number; high?: number };
  timeline?: { t: string; count: number }[];
  offenders?: { key: string; count: number }[];
  types?: { key: string; count: number }[];
  mitre?: { key: string; count: number }[];
  severity?: { key: string; count: number }[];
};

type ReconData = {
  hex?: string | null;
  pcapUrl?: string | null;
  probe_ip?: string | null;
  session_id?: string;
  error?: string;
};

function rowKey(d: Detection) {
  return `${d.index || "alerts"}::${d.id}`;
}

export default function AlertsPage() {
  const [q, setQ] = React.useState("");
  const [sev, setSev] = React.useState<string[]>(["all"]);
  const [type, setType] = React.useState<string[]>(["all"]);
  const [alertType, setAlertType] = React.useState<string[]>(["all"]);
  const [probe, setProbe] = React.useState<string[]>(["all"]);
  const [link, setLink] = React.useState<string[]>(["all"]);
  const [rules, setRules] = React.useState<AdvancedRule[]>([]);
  const [filterOpen, setFilterOpen] = React.useState(true);
  const [aggs, setAggs] = React.useState<any>({});
  const [rows, setRows] = React.useState<Detection[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(50);
  const [range, setRange] = useDateRange("now-7d");
  const [selected, setSelected] = React.useState<Detection | null>(null);
  const [checked, setChecked] = React.useState<Set<string>>(new Set());
  const [view, setView] = React.useState<ViewMode>("grid");
  const [summary, setSummary] = React.useState<AlertSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = React.useState(false);
  const [recon, setRecon] = React.useState<ReconData | null>(null);
  const [reconLoading, setReconLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [actionBusy, setActionBusy] = React.useState(false);

  const filterParams = React.useCallback(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      startTime: range.startTime,
      endTime: range.endTime,
      query: q,
      severity: selectedParam(sev),
      type: selectedParam(type),
      alert_type: selectedParam(alertType),
      probe: selectedParam(probe),
      link: selectedParam(link),
    });
    const adv = rulesToQuery(rules);
    if (adv) params.set("advanced", adv);
    return params;
  }, [q, sev, type, alertType, probe, link, rules, page, pageSize, range]);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch(`/alerts?${filterParams()}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      const items: Detection[] = json.items || [];
      setRows(items);
      setTotal(json.total || 0);
      setAggs(json.aggs || {});
      setSelected((cur) => {
        if (cur && items.some((d) => d.id === cur.id && (d.index || "") === (cur.index || ""))) {
          return items.find((d) => d.id === cur.id && (d.index || "") === (cur.index || "")) || cur;
        }
        return items[0] || null;
      });
      setChecked((prev) => {
        const keys = new Set(items.map(rowKey));
        const next = new Set<string>();
        prev.forEach((k) => {
          if (keys.has(k)) next.add(k);
        });
        return next;
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [filterParams]);

  React.useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  React.useEffect(() => {
    if (view !== "summary") return;
    let cancelled = false;
    (async () => {
      try {
        setSummaryLoading(true);
        const params = new URLSearchParams({
          startTime: range.startTime,
          endTime: range.endTime,
        });
        const res = await apiFetch(`/alerts/summary?${params}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Summary failed");
        if (!cancelled) {
          setSummary(json);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Summary failed");
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view, range]);

  React.useEffect(() => {
    if (!selected?.id) {
      setRecon(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setReconLoading(true);
        const params = new URLSearchParams({ id: selected.id });
        if (selected.index) params.set("index", selected.index);
        const res = await apiFetch(`/alerts/reconstruction?${params}`, { cache: "no-store" });
        const json = await res.json();
        if (!cancelled) {
          setRecon(res.ok ? json : { error: json.error || "Reconstruction failed" });
        }
      } catch (e) {
        if (!cancelled) setRecon({ error: e instanceof Error ? e.message : "Reconstruction failed" });
      } finally {
        if (!cancelled) setReconLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected?.id, selected?.index]);

  function resetFilters() {
    setQ("");
    setSev(["all"]);
    setType(["all"]);
    setAlertType(["all"]);
    setProbe(["all"]);
    setLink(["all"]);
    setRules([]);
    setPage(0);
  }

  const buckets = (key: string) =>
    ((aggs[key] || []) as { key: string; doc_count: number }[]).map((b) => ({
      key: String(b.key),
      label: String(b.key),
      count: b.doc_count,
    }));

  function selectedIds(): { _id: string; _index?: string }[] {
    return rows
      .filter((d) => checked.has(rowKey(d)))
      .map((d) => ({ _id: d.id, _index: d.index }));
  }

  async function runAction(action: "flag" | "unflag" | "tag", tagName?: string) {
    const ids = selectedIds();
    if (!ids.length) {
      setError("Select one or more alerts first");
      return;
    }
    const user = readSessionUser()?.user_id || "spiderx";
    try {
      setActionBusy(true);
      const res = await apiFetch("/alerts/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids, user, tagName }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Action failed");
      setChecked(new Set());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setActionBusy(false);
    }
  }

  async function exportCsv() {
    const ids = selectedIds();
    const params = new URLSearchParams({
      startTime: range.startTime,
      endTime: range.endTime,
      query: q,
      pageSize: "5000",
    });
    if (ids.length) params.set("ids", ids.map((i) => i._id).join(","));
    window.open(await apiUrl(`/alerts/actions?${params}`), "_blank");
  }

  function toggleCheck(d: Detection, e?: React.MouseEvent) {
    e?.stopPropagation();
    const k = rowKey(d);
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function toggleAllOnPage() {
    const keys = rows.map(rowKey);
    const allSelected = keys.length > 0 && keys.every((k) => checked.has(k));
    setChecked((prev) => {
      const next = new Set(prev);
      if (allSelected) keys.forEach((k) => next.delete(k));
      else keys.forEach((k) => next.add(k));
      return next;
    });
  }

  const allPageChecked = rows.length > 0 && rows.every((d) => checked.has(rowKey(d)));
  const checkedCount = checked.size;

  return (
    <PageFrame
      title="Detections"
      subtitle={`Live logvehere-alerts-* · ${total.toLocaleString()}${loading ? " · loading…" : ""}`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-border/70">
            <button
              type="button"
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition",
                view === "grid" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
              )}
              onClick={() => setView("grid")}
            >
              Grid
            </button>
            <button
              type="button"
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition",
                view === "summary" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
              )}
              onClick={() => setView("summary")}
            >
              Summary
            </button>
          </div>
          <DateRangeBar
            value={range}
            onChange={(v) => {
              setPage(0);
              setRange(v);
            }}
          />
        </div>
      }
    >
      <div className="flex h-full min-h-0 gap-3 overflow-hidden">
        <AdvancedFilterPanel
          open={filterOpen}
          onOpenChange={setFilterOpen}
          groups={[
            {
              id: "priority",
              label: "Priority",
              selected: sev,
              onChange: (v) => {
                setPage(0);
                setSev(v);
              },
              options: buckets("by_priority").length
                ? buckets("by_priority")
                : ["critical", "high", "medium", "low"].map((k) => ({ key: k, label: k })),
            },
            {
              id: "type",
              label: "Type",
              selected: type,
              onChange: (v) => {
                setPage(0);
                setType(v);
              },
              options: buckets("by_type"),
            },
            {
              id: "alert_type",
              label: "Alert type",
              selected: alertType,
              onChange: (v) => {
                setPage(0);
                setAlertType(v);
              },
              options: buckets("by_alert_type"),
            },
            {
              id: "probe",
              label: "Probe host",
              selected: probe,
              onChange: (v) => {
                setPage(0);
                setProbe(v);
              },
              options: buckets("by_probe"),
            },
            {
              id: "link",
              label: "Link name",
              selected: link,
              onChange: (v) => {
                setPage(0);
                setLink(v);
              },
              options: buckets("by_link"),
            },
          ]}
          advancedFields={[
            { id: "alert_name", label: "Alert name", type: "text" },
            { id: "value", label: "Value", type: "ip" },
            { id: "probe_ip", label: "Probe IP", type: "ip" },
            { id: "src_port", label: "Src port", type: "port" },
            { id: "dst_port", label: "Dst port", type: "port" },
            { id: "protocol", label: "Protocol", type: "protocol" },
            { id: "link_name", label: "Link name", type: "keyword" },
            { id: "probe_host_name", label: "Probe host", type: "keyword" },
            { id: "type", label: "Type", type: "keyword" },
            { id: "alert_type", label: "Alert type", type: "keyword" },
            { id: "priority", label: "Priority", type: "keyword" },
          ]}
          rules={rules}
          onRulesChange={setRules}
          onReset={resetFilters}
          onApply={() => {
            setPage(0);
            load();
          }}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
          {error && (
            <div className="shrink-0 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
              {error}
            </div>
          )}

          {view === "summary" ? (
            <div className="min-h-0 flex-1 space-y-3 overflow-auto scroll-thin">
              {summaryLoading && (
                <p className="text-xs text-muted-foreground">Loading summary…</p>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                <KpiCard label="Total alerts" value={summary?.kpi?.total ?? 0} />
                <KpiCard label="High / critical" value={summary?.kpi?.high ?? 0} />
                <KpiCard label="Flagged" value={summary?.kpi?.flagged ?? 0} />
              </div>
              <ChartPanel title="Alert timeline" height="h-64">
                <SparkArea
                  values={(summary?.timeline || []).map((t) => t.count)}
                  labels={(summary?.timeline || []).map((t) =>
                    t.t ? new Date(t.t).toLocaleString() : ""
                  )}
                />
              </ChartPanel>
              <div className="grid gap-3 lg:grid-cols-2">
                <ChartPanel title="Top offenders" height="h-64">
                  <MiniBars
                    data={(summary?.offenders || []).map((b) => ({
                      label: String(b.key),
                      value: b.count,
                    }))}
                  />
                </ChartPanel>
                <ChartPanel title="By type" height="h-64">
                  <MiniBars
                    data={(summary?.types || []).map((b) => ({
                      label: String(b.key),
                      value: b.count,
                    }))}
                  />
                </ChartPanel>
                <ChartPanel title="MITRE techniques" height="h-64">
                  <MiniBars
                    data={(summary?.mitre || []).map((b) => ({
                      label: String(b.key),
                      value: b.count,
                    }))}
                  />
                </ChartPanel>
                <ChartPanel title="Severity" height="h-64">
                  <MiniBars
                    data={(summary?.severity || []).map((b) => ({
                      label: String(b.key),
                      value: b.count,
                    }))}
                  />
                </ChartPanel>
              </div>
            </div>
          ) : (
            <>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <div className="relative min-w-[200px] flex-1">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Quick search name, value, link, host…"
                    value={q}
                    onChange={(e) => {
                      setPage(0);
                      setQ(e.target.value);
                    }}
                  />
                </div>
                <Button size="sm" variant="outline" disabled={actionBusy} onClick={exportCsv}>
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Export CSV
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={actionBusy || !checkedCount}
                  onClick={() => runAction("flag")}
                >
                  <Flag className="mr-1.5 h-3.5 w-3.5" />
                  Flag
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={actionBusy || !checkedCount}
                  onClick={() => runAction("unflag")}
                >
                  Unflag
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={actionBusy || !checkedCount}
                  onClick={() => {
                    const name = window.prompt("Tag name");
                    if (name?.trim()) runAction("tag", name.trim());
                  }}
                >
                  <Tag className="mr-1.5 h-3.5 w-3.5" />
                  Tag
                </Button>
                {checkedCount > 0 && (
                  <span className="text-xs text-muted-foreground">{checkedCount} selected</span>
                )}
              </div>

              <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-[1fr_320px]">
                <Card className="flex min-h-0 flex-col overflow-hidden">
                  <div className="min-h-0 flex-1 overflow-auto scroll-thin">
                    <table className="w-full min-w-[780px] text-left text-sm">
                      <thead className="sticky top-0 z-10 border-b bg-muted/90 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
                        <tr>
                          <th className="w-10 px-3 py-2">
                            <input
                              type="checkbox"
                              checked={allPageChecked}
                              onChange={toggleAllOnPage}
                              aria-label="Select all on page"
                            />
                          </th>
                          <th className="px-3 py-2 font-medium">Severity</th>
                          <th className="px-3 py-2 font-medium">Detection</th>
                          <th className="px-3 py-2 font-medium">Value / Link</th>
                          <th className="px-3 py-2 font-medium">Type</th>
                          <th className="px-3 py-2 font-medium">Probe</th>
                          <th className="px-3 py-2 font-medium">Age</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-3 py-10 text-center text-xs text-muted-foreground">
                              {loading ? "Loading alerts…" : "No alerts match filters"}
                            </td>
                          </tr>
                        )}
                        {rows.map((d) => (
                          <tr
                            key={rowKey(d)}
                            onClick={() => setSelected(d)}
                            className={cn(
                              "cursor-pointer border-b border-border/50 transition hover:bg-primary/5",
                              selected?.id === d.id && selected?.index === d.index && "bg-primary/10"
                            )}
                          >
                            <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={checked.has(rowKey(d))}
                                onChange={() => toggleCheck(d)}
                                aria-label={`Select ${d.title}`}
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex flex-wrap items-center gap-1">
                                <Badge variant={d.severity}>{d.severity}</Badge>
                                {d.flagged && (
                                  <Badge variant="secondary" className="gap-0.5 text-[10px]">
                                    <Flag className="h-2.5 w-2.5" />
                                    Flagged
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="font-medium">{d.title}</div>
                              <div className="font-mono text-[10px] text-muted-foreground">{d.id}</div>
                              {!!d.tags?.length && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {d.tags.slice(0, 3).map((t) => (
                                    <Badge key={t.name} variant="outline" className="text-[9px]">
                                      {t.name}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-[11px]">
                              {d.src} → {d.dst}
                            </td>
                            <td className="px-3 py-2.5 text-xs">
                              {d.protocol && d.protocol !== "-" ? d.protocol : d.alert_type || "—"}
                            </td>
                            <td className="px-3 py-2.5 text-xs">{d.host}</td>
                            <td className="px-3 py-2.5 text-xs text-muted-foreground">
                              {d.ts ? relativeTime(d.ts) : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <PaginationBar
                    page={page}
                    pageSize={pageSize}
                    total={total}
                    onPageChange={setPage}
                    onPageSizeChange={(s) => {
                      setPage(0);
                      setPageSize(s);
                    }}
                  />
                </Card>

                <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
                  <Card className="min-h-0 flex-1 overflow-hidden">
                    <InvestigationDock detection={selected} />
                  </Card>
                  <Card className="max-h-[42%] shrink-0 overflow-hidden">
                    <CardHeader className="space-y-1 p-3 pb-2">
                      <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Reconstruction
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 overflow-auto p-3 pt-0 scroll-thin">
                      {!selected && (
                        <p className="text-xs text-muted-foreground">Select an alert to reconstruct.</p>
                      )}
                      {selected && reconLoading && (
                        <p className="text-xs text-muted-foreground">Loading reconstruction…</p>
                      )}
                      {selected && !reconLoading && recon?.error && (
                        <p className="text-xs text-primary">{recon.error}</p>
                      )}
                      {selected && !reconLoading && recon && !recon.error && (
                        <>
                          <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
                            <div>
                              Probe IP{" "}
                              <span className="font-mono text-foreground">{recon.probe_ip || "—"}</span>
                            </div>
                            <div>
                              Session{" "}
                              <span className="truncate font-mono text-foreground">
                                {recon.session_id || "—"}
                              </span>
                            </div>
                          </div>
                          {recon.pcapUrl && (
                            <a
                              href={recon.pcapUrl}
                              className="inline-flex text-xs font-medium text-primary underline-offset-2 hover:underline"
                              target="_blank"
                              rel="noreferrer"
                            >
                              Download PCAP
                            </a>
                          )}
                          {recon.hex ? (
                            <HexBufferViewer hex={recon.hex} className="max-h-40" />
                          ) : (
                            <p className="text-xs text-muted-foreground">No hex payload on this alert.</p>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </PageFrame>
  );
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{Number(value).toLocaleString()}</div>
      </CardContent>
    </Card>
  );
}
