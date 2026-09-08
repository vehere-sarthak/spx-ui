"use client";

import { apiFetch } from "@/lib/api-client";
import * as React from "react";
import { PageFrame } from "@/components/ndr/page-frame";
import { DateRangeBar, useDateRange } from "@/components/ndr/date-range-bar";
import { PaginationBar } from "@/components/ndr/pagination-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { formatBytes, relativeTime, cn } from "@/lib/utils";
import { MiniBars, RingMix, SparkArea } from "@/components/ndr/charts";
import {
  AdvancedFilterPanel,
  AdvancedRule,
  rulesToQuery,
  selectedParam,
} from "@/components/ndr/advanced-filter-panel";
import {
  EMPTY_PB,
  type PbData,
  loadSurveyConfig,
  parseLinkRows,
  postBulkImportPbLinks,
  saveSurveyConfig,
} from "@/lib/link-survey";

type LinkRow = {
  id: string;
  name: string;
  probe: string;
  probe_ip?: string;
  state: string;
  mbps?: number;
  packets: number;
  bytes: number;
  soi: number;
  protocols?: string[];
  applications?: string[];
  encapsulations?: string[];
  countries?: string[];
  iface_names?: string[];
  identifier_type?: string;
  identifier_value?: string;
  ts?: string;
  protocols_count?: Record<string, number>;
  applications_count?: Record<string, number>;
  username?: string;
  email?: string;
  user_name?: string;
  email_id?: string;
};

const TEXTAREA =
  "flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-mono";

const PII_FIELDS = ["username", "user_name", "email", "email_id", "pbUsername"] as const;

function redact(v: string) {
  if (!v || v === "—") return "—";
  if (v.includes("@")) {
    const [u, d] = v.split("@");
    return `${u.slice(0, 1)}***@${d}`;
  }
  if (v.length <= 2) return "**";
  return `${v.slice(0, 2)}${"*".repeat(Math.min(6, v.length - 2))}`;
}

export default function LinksPage() {
  const [items, setItems] = React.useState<LinkRow[]>([]);
  const [kpi, setKpi] = React.useState<any>(null);
  const [facets, setFacets] = React.useState<any>({});
  const [selected, setSelected] = React.useState<LinkRow | null>(null);
  const [detail, setDetail] = React.useState<any>(null);
  const [q, setQ] = React.useState("");
  const [probeHost, setProbeHost] = React.useState<string[]>(["all"]);
  const [idType, setIdType] = React.useState<string[]>(["all"]);
  const [stateFilter, setStateFilter] = React.useState<string[]>(["all"]);
  const [rules, setRules] = React.useState<AdvancedRule[]>([]);
  const [filterOpen, setFilterOpen] = React.useState(true);
  const [range, setRange] = useDateRange("now-1d");
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(50);
  const [total, setTotal] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [surveyOpen, setSurveyOpen] = React.useState(false);
  const [pb, setPb] = React.useState<PbData>(EMPTY_PB);
  const [vlanText, setVlanText] = React.useState("");
  const [surveyBusy, setSurveyBusy] = React.useState(false);
  const [revealed, setRevealed] = React.useState<Record<string, string>>({});
  const [revealBusy, setRevealBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        startTime: range.startTime,
        endTime: range.endTime,
        page: String(page),
        pageSize: String(pageSize),
      });
      if (q.trim()) params.set("query", q.trim());
      const ph = selectedParam(probeHost);
      const it = selectedParam(idType);
      const st = selectedParam(stateFilter);
      if (ph !== "all") params.set("probeHost", ph);
      if (it !== "all") params.set("identifierType", it);
      if (st !== "all") params.set("state", st);
      const adv = rulesToQuery(rules);
      if (adv) params.set("advanced", adv);
      const res = await apiFetch(`/link-monitoring?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setItems(json.items || []);
      setTotal(json.total || 0);
      setKpi(json.kpi);
      setFacets(json.facets || {});
      setSelected((cur) => {
        const next = (json.items || []).find((l: LinkRow) => l.id === cur?.id) || json.items?.[0] || null;
        return next;
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [q, probeHost, idType, stateFilter, rules, range, page, pageSize]);

  React.useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  React.useEffect(() => {
    if (!selected?.name) {
      setDetail(null);
      setRevealed({});
      return;
    }
    setRevealed({});
    (async () => {
      try {
        const params = new URLSearchParams({
          link_name: selected.name,
          startTime: range.startTime,
          endTime: range.endTime,
        });
        const res = await apiFetch(`/link-monitoring/detail?${params}`, { cache: "no-store" });
        const json = await res.json();
        if (res.ok) setDetail(json);
      } catch {
        setDetail(null);
      }
    })();
  }, [selected?.name, range]);

  function openSurvey() {
    setPb(loadSurveyConfig() || EMPTY_PB);
    setVlanText("");
    setSurveyOpen(true);
  }

  async function saveSurveyLocal() {
    saveSurveyConfig(pb);
    setError(null);
    setSurveyOpen(false);
  }

  async function runSurveyImport(withRows: boolean) {
    setSurveyBusy(true);
    try {
      saveSurveyConfig(pb);
      const rows = withRows ? parseLinkRows(vlanText) : [];
      if (withRows && !rows.length) {
        setError("Paste a VLAN / link list before importing");
        return;
      }
      const json = await postBulkImportPbLinks(pb, rows);
      setSurveyOpen(false);
      setVlanText("");
      setError(json.message || (rows.length ? `Imported ${json.inserted} row(s)` : "Survey config posted"));
      if (rows.length) load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Survey import failed");
    } finally {
      setSurveyBusy(false);
    }
  }

  async function revealField(field: string) {
    if (!selected) return;
    const id = selected.id || selected.name;
    setRevealBusy(field);
    try {
      const res = await apiFetch(`/pii/reveal?id=${encodeURIComponent(id)}&field=${encodeURIComponent(field)}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (json.status === "SUCCESS" && json.response != null) {
        setRevealed((prev) => ({ ...prev, [field]: String(json.response) }));
      } else {
        setError(json.message || json.error || `Could not reveal ${field}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reveal failed");
    } finally {
      setRevealBusy(null);
    }
  }

  const lastSrc = detail?.last || {};
  const piiCandidates = PII_FIELDS.map((field) => {
    const raw =
      (selected as any)?.[field] ??
      lastSrc[field] ??
      lastSrc?.pii?.[field] ??
      lastSrc?.payload?.[field];
    if (raw == null || raw === "") return null;
    return { field, value: String(raw) };
  }).filter(Boolean) as { field: string; value: string }[];

  const protoSlices = Object.entries(selected?.protocols_count || detail?.last?.protocols_count || {})
    .map(([name, value]) => ({ name, value: Number(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)
    .map((s, i) => ({
      ...s,
      color: ["#E11D2E", "#F97316", "#EAB308", "#3B82F6", "#64748B"][i],
    }));

  const trendBytes = (detail?.timeline || []).map((t: any) => Number(t.bytes || 0));
  const trendPkts = (detail?.timeline || []).map((t: any) => Number(t.packets || 0));
  const protocolList =
    (detail?.protocols || []).length > 0
      ? detail.protocols
      : Object.entries(selected?.protocols_count || {}).map(([name, value]) => ({
          name,
          value: Number(value),
        }));
  const ifaceList: string[] =
    selected?.iface_names?.length
      ? selected.iface_names
      : Array.isArray(lastSrc.iface_names)
        ? lastSrc.iface_names
        : [];

  return (
    <PageFrame
      title="Link Fabric"
      subtitle={
        loading
          ? "Loading link-stats-*"
          : `${kpi?.links ?? 0} links · ${kpi?.probes ?? 0} probes · ${formatBytes(kpi?.bytes || 0)}`
      }
      actions={
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={openSurvey}>
            Link Survey
          </Button>
          <DateRangeBar value={range} onChange={(v) => { setPage(0); setRange(v); }} />
        </div>
      }
    >
      <div className="flex h-full min-h-0 gap-3 overflow-hidden">
        <AdvancedFilterPanel
          open={filterOpen}
          onOpenChange={setFilterOpen}
          groups={[
            {
              id: "state",
              label: "Status",
              selected: stateFilter,
              onChange: (v) => { setPage(0); setStateFilter(v); },
              options: [
                { key: "passed", label: "Passed", count: kpi?.passed },
                { key: "failed", label: "Failed / stale", count: kpi?.failed },
                { key: "no-data", label: "No data", count: kpi?.noData },
              ],
            },
            {
              id: "probe",
              label: "Probe host",
              selected: probeHost,
              onChange: (v) => { setPage(0); setProbeHost(v); },
              options: (facets.probeHost || []).map((b: any) => ({
                key: String(b.key),
                label: String(b.key),
                count: b.doc_count,
              })),
            },
            {
              id: "idType",
              label: "Identifier type",
              selected: idType,
              onChange: (v) => { setPage(0); setIdType(v); },
              options: (facets.identifierType || []).map((b: any) => ({
                key: String(b.key),
                label: String(b.key),
                count: b.doc_count,
              })),
            },
          ]}
          advancedFields={[
            { id: "link_name", label: "Link name" },
            { id: "probe_host_name", label: "Probe host" },
            { id: "probe_ip", label: "Probe IP" },
            { id: "identifier_type", label: "Identifier type" },
            { id: "identifier_value", label: "Identifier value" },
          ]}
          rules={rules}
          onRulesChange={setRules}
          onReset={() => {
            setQ("");
            setProbeHost(["all"]);
            setIdType(["all"]);
            setStateFilter(["all"]);
            setRules([]);
            setPage(0);
          }}
          onApply={() => { setPage(0); load(); }}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
        {error && (
          <div className="shrink-0 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
            {error}
          </div>
        )}

        <div className="grid shrink-0 gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <Kpi label="Passed" value={kpi?.passed ?? 0} tone="ok" />
          <Kpi label="Failed / stale" value={kpi?.failed ?? 0} tone="warn" />
          <Kpi label="No data" value={kpi?.noData ?? 0} />
          <Kpi label="SOI hits" value={Math.round(kpi?.soi || 0)} />
          <Kpi label="Packets" value={Number(kpi?.packets || 0).toLocaleString()} />
        </div>

        <Input
          className="max-w-sm shrink-0"
          placeholder="Search link, probe, identifier…"
          value={q}
          onChange={(e) => { setPage(0); setQ(e.target.value); }}
        />

        <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-[1.3fr_1fr]">
          <Card className="flex min-h-0 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-auto scroll-thin">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="sticky top-0 z-10 border-b bg-muted/90 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Link</th>
                    <th className="px-3 py-2 text-left font-medium">Probe</th>
                    <th className="px-3 py-2 text-left font-medium">State</th>
                    <th className="px-3 py-2 text-left font-medium">Bytes</th>
                    <th className="px-3 py-2 text-left font-medium">SOI</th>
                    <th className="px-3 py-2 text-left font-medium">Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-10 text-center text-xs text-muted-foreground">
                        {loading ? "Loading…" : "No links in window"}
                      </td>
                    </tr>
                  )}
                  {items.map((l) => (
                    <tr
                      key={l.id}
                      onClick={() => setSelected(l)}
                      className={cn(
                        "cursor-pointer border-b border-border/50 hover:bg-primary/5",
                        selected?.id === l.id && "bg-primary/10"
                      )}
                    >
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{l.name}</div>
                        {(l.identifier_type || l.identifier_value) && (
                          <div className="text-[10px] text-muted-foreground">
                            {[l.identifier_type, l.identifier_value].filter(Boolean).join(":")}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {l.probe}
                        <div className="font-mono text-[10px] text-muted-foreground">{l.probe_ip}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge
                          variant={
                            l.state === "passed" ? "success" : l.state === "failed" ? "high" : "critical"
                          }
                        >
                          {l.state}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs">{formatBytes(l.bytes || 0)}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{l.soi}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {l.ts ? relativeTime(l.ts) : "—"}
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

          <div className="flex min-h-0 flex-col gap-3 overflow-auto scroll-thin">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{selected?.name || "Select a link"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {selected ? (
                  <>
                    <div className="grid grid-cols-2 gap-2 pb-1">
                      <Kpi label="Packets" value={Number(selected.packets || detail?.totals?.packets || 0).toLocaleString()} />
                      <Kpi label="Bytes" value={formatBytes(selected.bytes || detail?.totals?.bytes || 0)} />
                    </div>
                    <Row k="Probe" v={`${selected.probe} (${selected.probe_ip || "-"})`} />
                    <Row k="Identifier" v={`${selected.identifier_type || "-"}:${selected.identifier_value || "-"}`} />
                    <Row k="Mbps" v={selected.mbps != null ? String(selected.mbps) : "—"} />
                    <Row k="Apps" v={(selected.applications || []).slice(0, 6).join(", ") || "—"} />
                    <Row k="Encaps" v={(selected.encapsulations || []).join(", ") || "—"} />

                    <div className="border-t border-border/40 pt-2">
                      <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Protocols</div>
                      {protocolList.length ? (
                        <div className="flex flex-wrap gap-1">
                          {protocolList.slice(0, 12).map((p: any) => (
                            <Badge key={p.name || p} variant="secondary">
                              {p.name || p}
                              {p.value != null ? ` · ${p.value}` : ""}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted-foreground">—</p>
                      )}
                    </div>

                    <div className="border-t border-border/40 pt-2">
                      <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Interfaces</div>
                      {ifaceList.length ? (
                        <div className="flex flex-wrap gap-1">
                          {ifaceList.map((iface) => (
                            <Badge key={iface} variant="outline">
                              {iface}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted-foreground">—</p>
                      )}
                    </div>

                    {piiCandidates.length > 0 && (
                      <div className="space-y-1.5 border-t border-border/40 pt-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">PII</div>
                        {piiCandidates.map(({ field, value }) => (
                          <div key={field} className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">{field}</span>
                            <span className="flex items-center gap-2 font-mono">
                              {revealed[field] ?? redact(value)}
                              {!revealed[field] && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-[10px]"
                                  disabled={revealBusy === field}
                                  onClick={() => revealField(field)}
                                >
                                  {revealBusy === field ? "…" : "Reveal"}
                                </Button>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground">Pick a row to inspect</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Bytes trend</CardTitle>
              </CardHeader>
              <CardContent className="h-40">
                {trendBytes.length > 0 ? (
                  <SparkArea values={trendBytes} />
                ) : (
                  <p className="text-xs text-muted-foreground">No timeline</p>
                )}
              </CardContent>
            </Card>

            {trendPkts.some((v: number) => v > 0) && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Packets trend</CardTitle>
                </CardHeader>
                <CardContent className="h-36">
                  <SparkArea values={trendPkts} color="hsl(210 90% 55%)" />
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Protocol mix</CardTitle>
              </CardHeader>
              <CardContent className="min-h-[160px]">
                {protoSlices.length > 0 ? (
                  <RingMix slices={protoSlices} />
                ) : (
                  <p className="text-xs text-muted-foreground">No protocol counts</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Top talkers</CardTitle>
              </CardHeader>
              <CardContent className="h-36">
                {items.length > 0 ? (
                  <MiniBars
                    horizontal
                    className="h-full"
                    data={items
                      .slice()
                      .sort((a, b) => b.bytes - a.bytes)
                      .slice(0, 6)
                      .map((l) => ({
                        label: l.name.length > 12 ? l.name.slice(0, 12) : l.name,
                        value: Math.max(1, Math.round(l.bytes / 1_000_000)),
                      }))}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">No data</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
        </div>
      </div>

      <Dialog open={surveyOpen} onOpenChange={setSurveyOpen}>
        <DialogContent className="sm:max-w-lg">
          <div className="max-h-[80vh] space-y-3 overflow-auto pr-1">
            <h3 className="text-base font-semibold">Link Survey</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>pbIP *</Label>
                <Input value={pb.pbIP} onChange={(e) => setPb((p) => ({ ...p, pbIP: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>pbPort</Label>
                <Input value={pb.pbPort} onChange={(e) => setPb((p) => ({ ...p, pbPort: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>pbType</Label>
                <Select value={pb.pbType} onValueChange={(v) => setPb((p) => ({ ...p, pbType: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ixia">ixia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>pbDeviceName</Label>
                <Input
                  value={pb.pbDeviceName}
                  onChange={(e) => setPb((p) => ({ ...p, pbDeviceName: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>pbUsername</Label>
                <Input
                  value={pb.pbUsername}
                  onChange={(e) => setPb((p) => ({ ...p, pbUsername: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>pbPassword</Label>
                <Input
                  type="password"
                  value={pb.pbPassword}
                  onChange={(e) => setPb((p) => ({ ...p, pbPassword: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>VLAN / link rows (optional)</Label>
              <textarea
                className={TEXTAREA}
                placeholder={"100\n200\nor title,value,type"}
                value={vlanText}
                onChange={(e) => setVlanText(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setSurveyOpen(false)}>
                Cancel
              </Button>
              <Button variant="secondary" disabled={surveyBusy} onClick={saveSurveyLocal}>
                Save locally
              </Button>
              <Button
                variant="outline"
                disabled={surveyBusy || !pb.pbIP.trim()}
                onClick={() => runSurveyImport(false)}
              >
                Post config
              </Button>
              <Button disabled={surveyBusy || !pb.pbIP.trim()} onClick={() => runSurveyImport(true)}>
                {surveyBusy ? "Working…" : "Import VLANs"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </PageFrame>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string | number; tone?: "ok" | "warn" }) {
  return (
    <div className="ndr-panel px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={cn(
          "text-lg font-semibold",
          tone === "ok" && "text-severity-success",
          tone === "warn" && "text-severity-high"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/40 py-1.5 last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="max-w-[60%] truncate text-right font-medium">{v}</span>
    </div>
  );
}
