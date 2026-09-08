"use client";

import { apiFetch } from "@/lib/api-client";
import * as React from "react";
import { PageFrame } from "@/components/ndr/page-frame";
import { DateRangeBar, useDateRange } from "@/components/ndr/date-range-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBytes, cn } from "@/lib/utils";
import { MiniBars, RingMix, SparkArea } from "@/components/ndr/charts";

export default function HealthPage() {
  const [host, setHost] = React.useState("all");
  const [range, setRange] = useDateRange("now-8h");
  const [data, setData] = React.useState<any>(null);
  const [bw, setBw] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ startTime: range.startTime, endTime: range.endTime });
      if (host !== "all") params.set("host", host);
      const bwParams = new URLSearchParams({ startTime: range.startTime, endTime: range.endTime });
      if (host !== "all") bwParams.set("probe", host);

      const [dashRes, bwRes] = await Promise.all([
        apiFetch(`/health/dashboard?${params}`, { cache: "no-store" }),
        apiFetch(`/health/bandwidth?${bwParams}`, { cache: "no-store" }),
      ]);
      const json = await dashRes.json();
      if (!dashRes.ok) throw new Error(json.error || "Failed");
      setData(json);

      const bwJson = await bwRes.json();
      if (bwRes.ok) setBw(bwJson);
      else setBw(null);

      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [host, range]);

  React.useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  const cpuVals = (data?.cpu || []).map((p: any) => Number(p.user || 0));
  const memVals = (data?.memory || []).map((p: any) => Number(p.used || 0));
  const disk = data?.disk || {};
  const diskTotal = Number(disk.total || 0);
  const diskUsed = Number(disk.used || 0);
  const diskFree = Number(disk.free || 0);
  const diskSlices =
    diskTotal > 0
      ? [
          { name: "Used", value: diskUsed, color: "#E11D2E" },
          { name: "Free", value: diskFree, color: "#3B82F6" },
        ]
      : [];

  const latestCpu = cpuVals.length ? cpuVals[cpuVals.length - 1] : null;
  const latestMem = memVals.length ? memVals[memVals.length - 1] : null;
  const bwVals = (bw?.timeline || []).map((p: any) => Number(p.bandwidth_mbps || 0));
  const latestBw = bwVals.length ? bwVals[bwVals.length - 1] : null;

  function exportPdf() {
    const win = window.open("", "_blank", "noopener,noreferrer,width=960,height=720");
    if (!win) {
      setError("Popup blocked — allow popups to export PDF");
      return;
    }
    const probeRows = (bw?.probes || [])
      .map(
        (p: any) =>
          `<tr><td>${esc(p.host || p.ip)}</td><td>${esc(p.ip)}</td><td>${Number(p.bandwidth_mbps || 0).toFixed(2)}</td><td>${formatBytes(p.bytes || 0)}</td></tr>`
      )
      .join("");
    const linkRows = (bw?.links || [])
      .map((l: any) => `<tr><td>${esc(l.key)}</td><td>${formatBytes(l.bytes || 0)}</td></tr>`)
      .join("");
    const hostRows = (data?.hosts || [])
      .map((h: any) => `<tr><td>${esc(h.name)}</td><td>${esc(h.system)}</td><td>${h.docs ?? 0}</td></tr>`)
      .join("");
    win.document.write(`<!DOCTYPE html><html><head><title>SpiderX Health Report</title>
<style>
  body{font-family:ui-sans-serif,system-ui,sans-serif;color:#111;margin:24px;font-size:13px}
  h1{font-size:20px;margin:0 0 4px} h2{font-size:14px;margin:20px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
  .meta{color:#666;margin-bottom:16px} .kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0 20px}
  .kpi div{border:1px solid #ddd;border-radius:6px;padding:10px} .kpi span{display:block;font-size:10px;text-transform:uppercase;color:#666}
  .kpi strong{font-size:16px} table{width:100%;border-collapse:collapse;margin-bottom:12px}
  th,td{border:1px solid #ddd;padding:6px 8px;text-align:left} th{background:#f5f5f5;font-size:11px;text-transform:uppercase}
  @media print{body{margin:12px}}
</style></head><body>
<h1>SpiderX Health Report</h1>
<p class="meta">Generated ${new Date().toLocaleString()} · Host filter: ${esc(host)} · Window ${esc(range.startTime)} → ${esc(range.endTime)}</p>
<div class="kpi">
  <div><span>Elasticsearch</span><strong>${data?.es?.ok ? "connected" : "—"}</strong></div>
  <div><span>CPU user %</span><strong>${latestCpu != null ? `${latestCpu}%` : "—"}</strong></div>
  <div><span>Memory used %</span><strong>${latestMem != null ? `${latestMem}%` : "—"}</strong></div>
  <div><span>Bandwidth Mbps</span><strong>${latestBw != null ? latestBw.toFixed(2) : "—"}</strong></div>
</div>
<h2>Disk</h2>
<p>Used ${diskTotal ? formatBytes(diskUsed) : "—"} of ${diskTotal ? formatBytes(diskTotal) : "—"}</p>
<h2>Bandwidth by probe</h2>
<table><thead><tr><th>Host</th><th>IP</th><th>Mbps</th><th>Bytes</th></tr></thead><tbody>${probeRows || "<tr><td colspan=4>No probe data</td></tr>"}</tbody></table>
<h2>Top links by bytes</h2>
<table><thead><tr><th>Link</th><th>Bytes</th></tr></thead><tbody>${linkRows || "<tr><td colspan=2>No link data</td></tr>"}</tbody></table>
<h2>Monitored hosts</h2>
<table><thead><tr><th>Name</th><th>System</th><th>Docs</th></tr></thead><tbody>${hostRows || "<tr><td colspan=3>No hosts</td></tr>"}</tbody></table>
<script>window.onload=function(){window.focus();window.print();}</script>
</body></html>`);
    win.document.close();
  }

  return (
    <PageFrame
      title="Health Dashboard"
      subtitle={
        loading
          ? "Loading metricbeat + ES"
          : `Host metrics from logvehere-monitor-* · ES ${data?.es?.cluster || "—"}`
      }
      actions={
        <>
          <Button size="sm" variant="outline" onClick={exportPdf}>
            Export PDF
          </Button>
          <Select value={host} onValueChange={setHost}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Host" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All hosts</SelectItem>
              {(data?.hosts || []).map((h: any) => (
                <SelectItem key={h.name} value={h.name}>
                  {h.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DateRangeBar
            value={range}
            onChange={setRange}
            presets={["now-1h", "now-6h", "now-1d", "now-7d", "custom"]}
          />
        </>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
        {error && (
          <div className="shrink-0 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
            {error}
          </div>
        )}

        <div className="grid shrink-0 gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <Stat
            label="Elasticsearch"
            value={data?.es?.ok ? "connected" : "—"}
            hint={`${data?.es?.cluster || ""} · ${data?.es?.version || ""}`}
            badge={data?.es?.ok ? "success" : "critical"}
          />
          <Stat label="CPU user %" value={latestCpu != null ? `${latestCpu}%` : "—"} hint="system.cpu.user.pct" />
          <Stat label="Memory used %" value={latestMem != null ? `${latestMem}%` : "—"} hint="system.memory.actual.used.pct" />
          <Stat
            label="Disk used"
            value={diskTotal ? formatBytes(diskUsed) : "—"}
            hint={diskTotal ? `of ${formatBytes(diskTotal)}` : "system.fsstat"}
          />
          <Stat
            label="Bandwidth"
            value={latestBw != null ? `${latestBw.toFixed(2)} Mbps` : "—"}
            hint="avg bandwidth_mbps"
          />
        </div>

        <div className="grid min-h-0 flex-1 gap-3 overflow-auto scroll-thin xl:grid-cols-2">
          <Card className="min-h-[280px]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">CPU (user %)</CardTitle>
            </CardHeader>
            <CardContent className="h-56">
              {cpuVals.some((v: number) => v > 0) || cpuVals.length > 0 ? (
                <SparkArea values={cpuVals.length ? cpuVals : [0]} />
              ) : (
                <p className="text-xs text-muted-foreground">No CPU series</p>
              )}
            </CardContent>
          </Card>

          <Card className="min-h-[280px]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Memory (used %)</CardTitle>
            </CardHeader>
            <CardContent className="h-56">
              {memVals.length > 0 ? (
                <SparkArea values={memVals} color="hsl(210 90% 55%)" />
              ) : (
                <p className="text-xs text-muted-foreground">No memory series</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Disk</CardTitle>
            </CardHeader>
            <CardContent className="min-h-[160px]">
              {diskSlices.length > 0 ? (
                <RingMix slices={diskSlices} />
              ) : (
                <p className="text-xs text-muted-foreground">No disk fsstat sample</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Processes (1h samples)</CardTitle>
            </CardHeader>
            <CardContent className="h-44">
              {(data?.processes || []).length > 0 ? (
                <MiniBars
                  className="h-full"
                  data={(data.processes || []).slice(0, 8).map((p: any) => ({
                    label: String(p.name).slice(0, 8),
                    value: p.count,
                  }))}
                />
              ) : (
                <p className="text-xs text-muted-foreground">No process metrics in window</p>
              )}
            </CardContent>
          </Card>

          <Card className="xl:col-span-2 min-h-[280px]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Bandwidth (Mbps)</CardTitle>
            </CardHeader>
            <CardContent className="h-56">
              {bwVals.length > 0 ? (
                <SparkArea values={bwVals} color="hsl(160 70% 40%)" />
              ) : (
                <p className="text-xs text-muted-foreground">No bandwidth series</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Bandwidth by probe</CardTitle>
            </CardHeader>
            <CardContent className="h-44">
              {(bw?.probes || []).length > 0 ? (
                <MiniBars
                  className="h-full"
                  data={(bw.probes || []).slice(0, 8).map((p: any) => ({
                    label: String(p.host || p.ip || "").slice(0, 10),
                    value: Math.max(0.01, Number(p.bandwidth_mbps || 0)),
                  }))}
                />
              ) : (
                <p className="text-xs text-muted-foreground">No probe bandwidth</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Top links (bytes)</CardTitle>
            </CardHeader>
            <CardContent className="h-44">
              {(bw?.links || []).length > 0 ? (
                <MiniBars
                  horizontal
                  className="h-full"
                  data={(bw.links || []).slice(0, 8).map((l: any) => ({
                    label: String(l.key || "").slice(0, 12),
                    value: Math.max(1, Math.round(Number(l.bytes || 0) / 1_000_000)),
                  }))}
                />
              ) : (
                <p className="text-xs text-muted-foreground">No link traffic</p>
              )}
            </CardContent>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Monitored hosts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {(data?.hosts || []).length === 0 && (
                  <span className="text-xs text-muted-foreground">{loading ? "Loading…" : "No hosts"}</span>
                )}
                {(data?.hosts || []).map((h: any) => (
                  <button
                    key={h.name}
                    onClick={() => setHost(h.name)}
                    className={cn(
                      "ndr-inset px-3 py-2 text-left text-xs transition hover:border-primary/40",
                      host === h.name && "border-primary/50 bg-primary/10"
                    )}
                  >
                    <div className="font-medium">{h.name}</div>
                    <div className="text-muted-foreground">
                      {h.system} · {h.docs} docs
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageFrame>
  );
}

function esc(v: unknown) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function Stat({
  label,
  value,
  hint,
  badge,
}: {
  label: string;
  value: string;
  hint?: string;
  badge?: "success" | "critical";
}) {
  return (
    <div className="ndr-panel px-3 py-2">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
        {badge && <Badge variant={badge}>{badge === "success" ? "ok" : "down"}</Badge>}
      </div>
      <div className="truncate text-lg font-semibold">{value}</div>
      {hint && <div className="truncate text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
