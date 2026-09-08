"use client";

import { apiFetch } from "@/lib/api-client";

import * as React from "react";
import {  } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Play, RefreshCw, Square, X } from "lucide-react";

type Appliance = {
  id: number;
  name: string;
  ip_address: string;
  username?: string;
  agent_status?: string;
  probe_status?: string;
};

function nameFromPci(pci?: string) {
  if (!pci) return "";
  return `p${String(pci).replace(/[^0-9a-fA-F]/g, "").toLowerCase()}`;
}

function agentDisplayState(agent: any): string {
  if (!agent && agent !== 0) return "Stopped";
  if (typeof agent === "object") {
    if (agent.active === true) return "Running";
    if (agent.active === false) return "Stopped";
    const s = String(agent.state || "").toLowerCase();
    if (s === "active" || s === "running") return "Running";
    return "Stopped";
  }
  const s = String(agent || "").toLowerCase();
  if (s === "active" || s === "running") return "Running";
  return "Stopped";
}

function collectConfiguredKeys(configured: any[], ifaceList: any[]) {
  const ifaceNameToPci = new Map<string, string>();
  for (const i of ifaceList) {
    if (i.kernel_iface && i.pci) ifaceNameToPci.set(i.kernel_iface, i.pci);
    if (i.name && i.pci) ifaceNameToPci.set(i.name, i.pci);
  }
  const keys = new Set<string>();
  const add = (v?: string) => {
    if (v) keys.add(v);
  };
  for (const p of configured) {
    for (const pci of p.pci || []) add(pci);
    for (const port of p.ports || []) {
      add(port.pci);
      add(port.iface);
      if (!port.pci && port.iface) add(ifaceNameToPci.get(port.iface));
    }
    for (const name of p.ifaces || []) {
      add(name);
      add(ifaceNameToPci.get(name));
    }
  }
  return keys;
}

function rowIdOf(iface: any, idx: number) {
  return iface.pci || iface.name || iface.kernel_iface || `iface-${idx}`;
}

export function SpxDetailPanel({
  appliance,
  appliances,
  onClose,
  onSelect,
  onStatusChange,
}: {
  appliance: Appliance;
  appliances: Appliance[];
  onClose: () => void;
  onSelect: (a: Appliance) => void;
  onStatusChange?: (id: number, agent: string, probe: string) => void;
}) {
  const id = appliance.id;
  const base = `/spx-management/${id}`;
  const idx = appliances.findIndex((a) => a.id === id);

  const [tab, setTab] = React.useState("probe-0");
  const [status, setStatus] = React.useState<any>(null);
  const [interfaces, setInterfaces] = React.useState<any[]>([]);
  const [agentConfig, setAgentConfig] = React.useState<any>(null);
  const [selectedPcis, setSelectedPcis] = React.useState<Set<string>>(new Set());
  const [savedPcis, setSavedPcis] = React.useState<Set<string>>(new Set());
  const [cpuByPci, setCpuByPci] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [msg, setMsg] = React.useState("");
  const [err, setErr] = React.useState("");
  const [ifaceQuery, setIfaceQuery] = React.useState("");
  const [activeIfaceId, setActiveIfaceId] = React.useState<string | null>(null);
  const [liveStats, setLiveStats] = React.useState<any>(null);
  const [testedOk, setTestedOk] = React.useState(false);
  const [draft, setDraft] = React.useState<any>(null);

  const statusRef = React.useRef(onStatusChange);
  statusRef.current = onStatusChange;

  const loadAll = React.useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [stRes, ifRes, agRes, prRes] = await Promise.all([
        apiFetch(`${base}/services/status`, { cache: "no-store" }),
        apiFetch(`${base}/interfaces`, { cache: "no-store" }),
        apiFetch(`${base}/config/agent`, { cache: "no-store" }),
        apiFetch(`${base}/config/probes`, { cache: "no-store" }),
      ]);
      const st = await stRes.json();
      const ifaces = await ifRes.json();
      const ag = await agRes.json();
      const probeCfg = await prRes.json();

      if (st?.error && !st?.agent) throw new Error(st.error);

      const ifaceList = ifaces?.interfaces || (Array.isArray(ifaces) ? ifaces : []) || [];
      setInterfaces(ifaceList);
      setStatus(st);

      const cfg = ag?.config || null;
      setAgentConfig(cfg);
      setDraft({
        cms: {
          enabled: !!cfg?.cms?.enabled,
          host: cfg?.cms?.host || "",
          port: cfg?.cms?.port ?? 22,
          user: cfg?.cms?.user || "",
          password: cfg?.cms?.password || "",
        },
        agent: {
          es_poll_interval: cfg?.agent?.es_poll_interval ?? cfg?.agent?.es_poll ?? 30,
          cms_poll_interval: cfg?.agent?.cms_poll_interval ?? cfg?.agent?.cms_poll ?? 60,
        },
        elasticsearch: {
          host: cfg?.elasticsearch?.host || "",
          port: cfg?.elasticsearch?.port || 9200,
          user: cfg?.elasticsearch?.user || "",
          password: cfg?.elasticsearch?.password || "",
          scheme: cfg?.elasticsearch?.scheme || "https",
          verify_certs: !!cfg?.elasticsearch?.verify_certs,
        },
        paths: cfg?.paths,
        indices: cfg?.elasticsearch?.indices,
      });

      const configured = probeCfg?.probes || probeCfg?.config?.probes || [];
      const configuredKeys = collectConfiguredKeys(configured, ifaceList);
      const selectedRowIds = new Set<string>();
      const cpus: Record<string, string> = {};
      for (const p of configured) {
        for (const port of p.ports || []) {
          let pci = port.pci || "";
          if (!pci && port.iface) {
            const hit = ifaceList.find((i: any) => i.kernel_iface === port.iface || i.name === port.iface);
            pci = hit?.pci || "";
          }
          if (pci && port.cpu) cpus[pci] = String(port.cpu);
        }
      }
      ifaceList.forEach((i: any, n: number) => {
        const rid = rowIdOf(i, n);
        if (
          configuredKeys.has(rid) ||
          (i.pci && configuredKeys.has(i.pci)) ||
          (i.name && configuredKeys.has(i.name)) ||
          (i.kernel_iface && configuredKeys.has(i.kernel_iface))
        ) {
          selectedRowIds.add(rid);
        }
      });
      setSelectedPcis(selectedRowIds);
      setSavedPcis(new Set(selectedRowIds));
      setCpuByPci(cpus);

      const agLabel = agentDisplayState(st?.agent);
      const prRunning = (st?.probes || []).some(
        (p: any) => p.running === true || String(p.state || "").toLowerCase() === "active"
      );
      statusRef.current?.(id, agLabel, prRunning ? "Running" : "Stopped");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load appliance");
      setInterfaces([]);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [base, id]);

  React.useEffect(() => {
    setTab("probe-0");
    setMsg("");
    setErr("");
    setActiveIfaceId(null);
    setLiveStats(null);
    setTestedOk(false);
    loadAll();
  }, [id, loadAll]);

  const numaNodes = React.useMemo(() => {
    const list = Array.from(new Set(interfaces.map((i: any) => i.numa ?? i.numa_node ?? 0)));
    const sorted = list.sort((a: any, b: any) => Number(a) - Number(b));
    return sorted.length ? sorted : [0];
  }, [interfaces]);

  const isProbeTab = tab.startsWith("probe-");
  const activeNumaIndex = isProbeTab ? Number(tab.replace("probe-", "")) || 0 : 0;
  const activeNuma = numaNodes[activeNumaIndex] ?? 0;

  const currentProbeStatus = React.useMemo(() => {
    const stProbes = status?.probes || [];
    return (
      stProbes.find((p: any) => p.numa === activeNuma) ||
      stProbes.find((p: any) => Number(p.id) === activeNumaIndex) ||
      null
    );
  }, [status, activeNuma, activeNumaIndex]);

  const probeRunning = Boolean(
    currentProbeStatus?.running === true ||
      String(currentProbeStatus?.state || "").toLowerCase() === "active"
  );

  const agentLabel = agentDisplayState(status?.agent);
  const agentRunning = agentLabel.toLowerCase() === "running";
  const probesRunning = (status?.probes || []).some(
    (p: any) => p.running === true || String(p.state || "").toLowerCase() === "active"
  );

  const probeRows = React.useMemo(() => {
    return interfaces
      .filter(
        (iface: any) =>
          (iface.numa ?? iface.numa_node ?? 0) === activeNuma ||
          (interfaces.length > 0 && numaNodes.length === 1)
      )
      .map((iface: any, n: number) => {
        const rid = rowIdOf(iface, n);
        return {
          id: rid,
          ...iface,
          name: iface.name || iface.kernel_iface || nameFromPci(iface.pci) || `iface-${n}`,
          ip: iface.ip || iface.ip_address || "",
          cpu: cpuByPci[rid] || cpuByPci[iface.pci] || "",
        };
      });
  }, [interfaces, activeNuma, numaNodes.length, cpuByPci]);

  const filteredProbeRows = React.useMemo(() => {
    if (!ifaceQuery.trim()) return probeRows;
    const q = ifaceQuery.toLowerCase().trim();
    return probeRows.filter(
      (r: any) =>
        r.name?.toLowerCase().includes(q) ||
        r.pci?.toLowerCase().includes(q) ||
        String(r.ip || "").includes(q)
    );
  }, [probeRows, ifaceQuery]);

  React.useEffect(() => {
    if (filteredProbeRows.length) {
      if (!activeIfaceId || !filteredProbeRows.some((r) => r.id === activeIfaceId)) {
        setActiveIfaceId(filteredProbeRows[0].id);
      }
    } else {
      setActiveIfaceId(null);
    }
  }, [filteredProbeRows, activeIfaceId]);

  const activeInterface = probeRows.find((r) => r.id === activeIfaceId) || probeRows[0] || null;
  const hasProbeChanges =
    selectedPcis.size !== savedPcis.size || [...selectedPcis].some((p) => !savedPcis.has(p));

  // Live iface-stats every 5s
  React.useEffect(() => {
    if (!isProbeTab) {
      setLiveStats(null);
      return;
    }
    const probeId = currentProbeStatus?.id != null ? Number(currentProbeStatus.id) : activeNumaIndex;
    let cancelled = false;
    const fetchStats = async () => {
      try {
        const res = await apiFetch(`${base}/services/probes/${probeId}/iface-stats`, { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && data && (data.text || (data.interfaces || []).length || data.stdout)) {
          setLiveStats(data);
        }
      } catch {
        /* ignore */
      }
    };
    fetchStats();
    const t = setInterval(fetchStats, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [base, isProbeTab, currentProbeStatus, activeNumaIndex]);

  async function runService(path: string, label: string) {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const res = await apiFetch(`${base}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.error || json.detail || json.message || `${label} failed`);
      const stRes = await apiFetch(`${base}/services/status`, { cache: "no-store" });
      const st = await stRes.json();
      setStatus(st);
      setMsg(label);
      const agLabel = agentDisplayState(st?.agent);
      const prRunning = (st?.probes || []).some(
        (p: any) => p.running === true || String(p.state || "").toLowerCase() === "active"
      );
      statusRef.current?.(id, agLabel, prRunning ? "Running" : "Stopped");
    } catch (e) {
      setErr(e instanceof Error ? e.message : `${label} failed`);
    } finally {
      setBusy(false);
    }
  }

  async function applySelection() {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const items = interfaces
        .filter((i: any, n: number) => {
          const key = rowIdOf(i, n);
          return selectedPcis.has(key) || (i.pci && selectedPcis.has(i.pci));
        })
        .map((i: any, n: number) => {
          const key = rowIdOf(i, n);
          return {
            pci: i.pci,
            numa: i.numa ?? i.numa_node ?? 0,
            name: nameFromPci(i.pci) || i.name || i.kernel_iface,
            capture_mode: i.capture_mode || "high_speed",
            kernel_iface: i.kernel_iface || "",
            role: i.role || "standard",
            max_bandwidth: i.max_bandwidth || "",
            speed: i.speed || "",
            cpu: (cpuByPci[key] || cpuByPci[i.pci] || "").trim() || undefined,
          };
        });
      const payload = items.length
        ? { interfaces: items, probe_ips: {} }
        : { interfaces: [], probe_ips: {}, clear: true };
      const res = await apiFetch(`${base}/config/probes/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok || result.error) throw new Error(result.error || result.detail || "Apply failed");
      setMsg(
        items.length
          ? `Configured ${result?.probes?.length || 1} probe instance(s) successfully.`
          : "All probe interfaces de-registered successfully."
      );
      await loadAll();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Apply failed");
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    if (!draft?.elasticsearch) return;
    setBusy(true);
    setErr("");
    setMsg("");
    setTestedOk(false);
    try {
      const res = await apiFetch(`${base}/config/agent/test-connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft.elasticsearch),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "Test failed");
      setTestedOk(true);
      setMsg(json.message || "Connection OK");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Test failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveAgent() {
    if (!testedOk) {
      setErr("Test Elasticsearch connection successfully before saving");
      return;
    }
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const config = {
        ...(agentConfig || {}),
        cms: draft.cms,
        agent: {
          ...(agentConfig?.agent || {}),
          es_poll_interval: draft.agent.es_poll_interval,
          cms_poll_interval: draft.agent.cms_poll_interval,
        },
        elasticsearch: {
          ...(agentConfig?.elasticsearch || {}),
          ...draft.elasticsearch,
        },
      };
      const res = await apiFetch(`${base}/config/agent`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || json.detail || "Save failed");
      setMsg("Agent configuration saved successfully.");
      setTestedOk(false);
      await loadAll();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function toggleSelect(rid: string) {
    setSelectedPcis((prev) => {
      const next = new Set(prev);
      if (next.has(rid)) next.delete(rid);
      else next.add(rid);
      return next;
    });
  }

  const liveText =
    liveStats?.text ||
    liveStats?.stdout ||
    (liveStats?.interfaces
      ? liveStats.interfaces
          .map((x: any) => `${x.name || x.iface || "?"}: rx=${x.rx || x.rx_packets || 0} tx=${x.tx || x.tx_packets || 0}`)
          .join("\n")
      : "");

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-lg border border-border/70 bg-card shadow-lg">
      {/* Tabs + nav */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-2 py-1.5">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1">
          {numaNodes.map((_, i) => (
            <button
              key={`probe-${i}`}
              type="button"
              onClick={() => setTab(`probe-${i}`)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium",
                tab === `probe-${i}` ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-muted/50"
              )}
            >
              Probe {i}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setTab("agent")}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium",
              tab === "agent" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-muted/50"
            )}
          >
            Agent Config
          </button>
        </div>
        <button
          type="button"
          className="rounded border border-border/60 p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
          disabled={idx <= 0}
          onClick={() => appliances[idx - 1] && onSelect(appliances[idx - 1])}
          title="Previous"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="rounded border border-border/60 p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
          disabled={idx < 0 || idx >= appliances.length - 1}
          onClick={() => appliances[idx + 1] && onSelect(appliances[idx + 1])}
          title="Next"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <button type="button" className="rounded border border-border/60 p-1 text-muted-foreground hover:text-foreground" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {(msg || err) && (
        <div
          className={cn(
            "flex shrink-0 items-start justify-between gap-2 px-3 py-2 text-xs",
            err ? "bg-destructive/15 text-destructive" : "bg-emerald-500/15 text-emerald-400"
          )}
        >
          <span>{err || msg}</span>
          <button type="button" onClick={() => { setMsg(""); setErr(""); }}>
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden p-3">
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading appliance…</p>
        ) : tab === "agent" ? (
          <div className="h-full space-y-3 overflow-auto scroll-thin">
            {!draft ? (
              <p className="text-xs text-muted-foreground">No agent config returned from appliance.</p>
            ) : (
              <>
                <section className="space-y-2 rounded-md border border-border/50 p-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">CMS</h4>
                    <div className="flex items-center gap-2 text-xs">
                      <span>Enable</span>
                      <Switch
                        checked={!!draft.cms.enabled}
                        onCheckedChange={(v) => {
                          setTestedOk(false);
                          setDraft((d: any) => ({ ...d, cms: { ...d.cms, enabled: v } }));
                        }}
                      />
                    </div>
                  </div>
                  {draft.cms.enabled && (
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Host" value={draft.cms.host} onChange={(v) => setDraft((d: any) => ({ ...d, cms: { ...d.cms, host: v } }))} />
                      <Field label="Port" value={String(draft.cms.port)} onChange={(v) => setDraft((d: any) => ({ ...d, cms: { ...d.cms, port: Number(v) || 0 } }))} />
                      <Field label="User" value={draft.cms.user} onChange={(v) => setDraft((d: any) => ({ ...d, cms: { ...d.cms, user: v } }))} />
                      <Field label="Password" type="password" value={draft.cms.password} onChange={(v) => setDraft((d: any) => ({ ...d, cms: { ...d.cms, password: v } }))} />
                    </div>
                  )}
                </section>

                <section className="space-y-2 rounded-md border border-border/50 p-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agent timers</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <Field
                      label="ES poll (sec)"
                      value={String(draft.agent.es_poll_interval)}
                      onChange={(v) => setDraft((d: any) => ({ ...d, agent: { ...d.agent, es_poll_interval: Number(v) || 0 } }))}
                    />
                    <Field
                      label="CMS poll (sec)"
                      value={String(draft.agent.cms_poll_interval)}
                      onChange={(v) => setDraft((d: any) => ({ ...d, agent: { ...d.agent, cms_poll_interval: Number(v) || 0 } }))}
                    />
                  </div>
                </section>

                <section className="space-y-2 rounded-md border border-border/50 p-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Elasticsearch / OpenSearch
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    <Field
                      label="Host"
                      value={draft.elasticsearch.host}
                      onChange={(v) => {
                        setTestedOk(false);
                        setDraft((d: any) => ({ ...d, elasticsearch: { ...d.elasticsearch, host: v } }));
                      }}
                    />
                    <Field
                      label="Port"
                      value={String(draft.elasticsearch.port)}
                      onChange={(v) => {
                        setTestedOk(false);
                        setDraft((d: any) => ({ ...d, elasticsearch: { ...d.elasticsearch, port: Number(v) || 0 } }));
                      }}
                    />
                    <Field
                      label="User"
                      value={draft.elasticsearch.user}
                      onChange={(v) => {
                        setTestedOk(false);
                        setDraft((d: any) => ({ ...d, elasticsearch: { ...d.elasticsearch, user: v } }));
                      }}
                    />
                    <Field
                      label="Password"
                      type="password"
                      value={draft.elasticsearch.password}
                      onChange={(v) => {
                        setTestedOk(false);
                        setDraft((d: any) => ({ ...d, elasticsearch: { ...d.elasticsearch, password: v } }));
                      }}
                    />
                    <div className="space-y-1">
                      <Label className="text-[11px]">Scheme</Label>
                      <Select
                        value={draft.elasticsearch.scheme}
                        onValueChange={(v) => {
                          setTestedOk(false);
                          setDraft((d: any) => ({ ...d, elasticsearch: { ...d.elasticsearch, scheme: v } }));
                        }}
                      >
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="https">https</SelectItem>
                          <SelectItem value="http">http</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end gap-2 pb-1 text-xs">
                      <Switch
                        checked={!!draft.elasticsearch.verify_certs}
                        onCheckedChange={(v) => {
                          setTestedOk(false);
                          setDraft((d: any) => ({ ...d, elasticsearch: { ...d.elasticsearch, verify_certs: v } }));
                        }}
                      />
                      Verify certs
                    </div>
                  </div>
                </section>

                <div className="flex flex-wrap gap-2 pb-2">
                  <Button size="sm" variant="outline" disabled={busy} onClick={testConnection}>
                    Test connection
                  </Button>
                  <Button size="sm" disabled={busy || !testedOk} onClick={saveAgent}>
                    Save configuration
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={loadAll}>
                    <RefreshCw className="mr-1 h-3.5 w-3.5" /> Refresh
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
            {/* Header + Start/Stop */}
            <div className="flex shrink-0 flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">{appliance.name || "SPX-Edge"}</div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={cn("h-1.5 w-1.5 rounded-full", agentRunning ? "bg-emerald-400" : "bg-red-500")} />
                    Agent: {agentLabel}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className={cn("h-1.5 w-1.5 rounded-full", probeRunning ? "bg-emerald-400" : "bg-red-500")} />
                    Probe {activeNumaIndex}: {probeRunning ? "Running" : "Stopped"}
                  </span>
                  <span className="font-mono">{appliance.ip_address}:19201</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  disabled={busy}
                  className={cn(agentRunning ? "bg-red-800 hover:bg-red-700" : "bg-emerald-700 hover:bg-emerald-600")}
                  onClick={() =>
                    runService(
                      agentRunning ? "services/agent/stop" : "services/agent/start",
                      agentRunning ? "Agent stopped" : "Agent started"
                    )
                  }
                >
                  {agentRunning ? <Square className="mr-1 h-3 w-3 fill-current" /> : <Play className="mr-1 h-3.5 w-3.5" />}
                  {agentRunning ? "Stop Agent" : "Start Agent"}
                </Button>
                <Button
                  size="sm"
                  disabled={busy}
                  className={cn(probesRunning ? "bg-red-800 hover:bg-red-700" : "bg-emerald-700 hover:bg-emerald-600")}
                  onClick={() =>
                    runService(
                      probesRunning ? "services/probes/stop" : "services/probes/start",
                      probesRunning ? "Probes stopped" : "Probes started"
                    )
                  }
                >
                  {probesRunning ? <Square className="mr-1 h-3 w-3 fill-current" /> : <Play className="mr-1 h-3.5 w-3.5" />}
                  {probesRunning ? "Stop Probes" : "Start Probes"}
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={loadAll}>
                  <RefreshCw className="mr-1 h-3.5 w-3.5" /> Refresh
                </Button>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Input
                className="h-8 flex-1"
                placeholder="Search interfaces…"
                value={ifaceQuery}
                onChange={(e) => setIfaceQuery(e.target.value)}
              />
              <button type="button" className="text-[11px] text-primary" onClick={() => setSelectedPcis(new Set(probeRows.map((r) => r.id)))}>
                Select all
              </button>
            </div>

            <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-[1.1fr_0.9fr]">
              <div className="min-h-0 overflow-auto rounded-md border border-border/50 scroll-thin">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/90 text-[10px] uppercase text-muted-foreground backdrop-blur">
                    <tr>
                      <th className="w-8 px-2 py-1.5" />
                      <th className="px-2 py-1.5 text-left">Name</th>
                      <th className="px-2 py-1.5 text-left">PCI</th>
                      <th className="px-2 py-1.5 text-left">IP</th>
                      <th className="px-2 py-1.5 text-left">Mode</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProbeRows.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => setActiveIfaceId(r.id)}
                        className={cn(
                          "cursor-pointer border-t border-border/40 hover:bg-primary/5",
                          activeIfaceId === r.id && "bg-primary/10"
                        )}
                      >
                        <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={selectedPcis.has(r.id)} onChange={() => toggleSelect(r.id)} />
                        </td>
                        <td className="px-2 py-1.5 font-medium">{r.name}</td>
                        <td className="px-2 py-1.5 font-mono text-[10px]">{r.pci || "—"}</td>
                        <td className="px-2 py-1.5 font-mono text-[10px]">{r.ip || "—"}</td>
                        <td className="px-2 py-1.5">{r.capture_mode || r.capture_label || "—"}</td>
                      </tr>
                    ))}
                    {!filteredProbeRows.length && (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                          {interfaces.length ? "No interfaces on this NUMA node" : "No interfaces from appliance"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="min-h-0 space-y-2 overflow-auto scroll-thin">
                <div className="rounded-md border border-border/50 p-2.5 text-[11px]">
                  <div className="mb-1.5 text-xs font-semibold">Interface overview</div>
                  {activeInterface ? (
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                      <OV k="Name" v={activeInterface.name} />
                      <OV k="PCI Express" v={activeInterface.pci} />
                      <OV k="Manufacture" v={activeInterface.manufacturer || activeInterface.vendor} />
                      <OV k="Mode" v={activeInterface.model || activeInterface.mode} />
                      <OV k="IP" v={activeInterface.ip} />
                      <OV k="DPDK capable" v={String(activeInterface.dpdk_capable ?? "—")} />
                      <OV k="Capture mode" v={activeInterface.capture_mode || activeInterface.capture_label} />
                      <OV k="Role" v={activeInterface.role} />
                      <OV k="Link" v={activeInterface.link_status || activeInterface.link} />
                      <OV k="Speed" v={activeInterface.speed || activeInterface.max_bandwidth} />
                      <OV k="CPU" v={activeInterface.cpu || "—"} />
                      <OV k="NUMA" v={String(activeInterface.numa ?? activeInterface.numa_node ?? "—")} />
                      <OV k="Driver" v={activeInterface.driver} />
                      <OV k="Compatible" v={String(activeInterface.compatible ?? "—")} />
                    </div>
                  ) : (
                    <p className="text-muted-foreground">Select an interface</p>
                  )}
                </div>

                <Button size="sm" className="w-full" disabled={busy || !hasProbeChanges} onClick={applySelection}>
                  Apply probe configuration
                </Button>

                {liveText && (
                  <div className="rounded-md border border-border/50 bg-muted/20 p-2">
                    <div className="mb-1 text-[11px] font-semibold text-muted-foreground">Live probe stdout / Linux stats</div>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[10px] scroll-thin">{liveText}</pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px]">{label}</Label>
      <Input className="h-9" type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function OV({ k, v }: { k: string; v?: string }) {
  return (
    <>
      <span className="text-muted-foreground">{k}</span>
      <span className="truncate font-medium" title={v || "—"}>
        {v || "—"}
      </span>
    </>
  );
}
