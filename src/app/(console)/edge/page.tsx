"use client";

import { apiFetch } from "@/lib/api-client";
import * as React from "react";
import { PageFrame } from "@/components/ndr/page-frame";
import { PaginationBar } from "@/components/ndr/pagination-bar";
import { SpxDetailPanel } from "@/components/ndr/spx-detail-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { relativeTime, cn } from "@/lib/utils";
import { Eye, Trash2 } from "lucide-react";

type Appliance = {
  id: number;
  name: string;
  ip_address: string;
  username?: string;
  created_by?: string;
  created_on?: number;
  probe_status?: string;
  agent_status?: string;
  last_seen?: string;
  links?: number;
  probe_host_name?: string;
};

export default function EdgePage() {
  const [appliances, setAppliances] = React.useState<Appliance[]>([]);
  const [appTotal, setAppTotal] = React.useState(0);
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(50);
  const [q, setQ] = React.useState("");
  const [selected, setSelected] = React.useState<Appliance | null>(null);
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", ip_address: "", username: "admin", password: "" });
  const [registering, setRegistering] = React.useState(false);

  const loadRegistry = React.useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), query: q });
    const res = await apiFetch(`/spx-management?${params}`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Registry failed");
    let items: Appliance[] = json.items || json.result || [];
    // Enrich statuses in parallel (best effort)
    items = await Promise.all(
      items.map(async (a) => {
        try {
          const st = await apiFetch(`/spx-management/${a.id}/services/status`, { cache: "no-store" }).then((r) =>
            r.json()
          );
          const agent =
            st.agent_status ||
            (st.agent?.active === true || String(st.agent?.state).toLowerCase() === "active" ? "Running" : "Stopped");
          const probe =
            st.probe_status ||
            ((st.probes || []).some((p: any) => p.running || String(p.state).toLowerCase() === "active")
              ? "Running"
              : "Stopped");
          return {
            ...a,
            agent_status: agent,
            probe_status: probe,
            last_seen: st.link_stats?.last_seen || st.probes?.[0]?.last_seen || a.last_seen,
            links: st.link_stats?.links ?? st.probes?.[0]?.links ?? a.links,
            probe_host_name: st.link_stats?.probe_host_name || a.probe_host_name,
          };
        } catch {
          return a;
        }
      })
    );
    setAppliances(items);
    setAppTotal(json.total || items.length);
    setSelected((cur) => {
      if (!cur) return cur;
      return items.find((x) => x.id === cur.id) || cur;
    });
  }, [page, pageSize, q]);

  React.useEffect(() => {
    const t = setTimeout(async () => {
      try {
        setLoading(true);
        await loadRegistry();
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [loadRegistry]);

  async function register() {
    setRegistering(true);
    try {
      const res = await apiFetch("/spx-management", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: form,
          // also top-level like vehere-ui
          ...form,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || json.message || "Register failed");
        return;
      }
      setOpen(false);
      setForm({ name: "", ip_address: "", username: "admin", password: "" });
      await loadRegistry();
    } finally {
      setRegistering(false);
    }
  }

  async function remove(a: Appliance) {
    if (!confirm(`Remove appliance "${a.name}" (${a.ip_address})?`)) return;
    const res = await apiFetch("/spx-management", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [a.id] }),
    });
    if (!res.ok) setError((await res.json()).error || "Delete failed");
    else {
      if (selected?.id === a.id) {
        setSelected(null);
        setPanelOpen(false);
      }
      loadRegistry();
    }
  }

  function openOverview(a: Appliance) {
    setSelected(a);
    setPanelOpen(true);
  }

  function onStatusChange(id: number, agent: string, probe: string) {
    setAppliances((list) =>
      list.map((a) => (a.id === id ? { ...a, agent_status: agent, probe_status: probe } : a))
    );
    setSelected((s) => (s?.id === id ? { ...s, agent_status: agent, probe_status: probe } : s));
  }

  return (
    <PageFrame
      title="Spider-X Edge"
      subtitle="Manage Spider-X Edge appliances for high-speed network traffic capture and metadata extraction."
      actions={
        <Button size="sm" onClick={() => setOpen(true)}>
          Register appliance
        </Button>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
        {error && (
          <div className="shrink-0 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
            {error}
          </div>
        )}

        <div className="grid shrink-0 gap-2 sm:grid-cols-3">
          <Stat label="Registered" value={appTotal} />
          <Stat
            label="Agent running"
            value={appliances.filter((a) => a.agent_status === "Running").length}
            tone="ok"
          />
          <Stat
            label="Probe running"
            value={appliances.filter((a) => a.probe_status === "Running").length}
            tone="ok"
          />
        </div>

        <Input
          className="max-w-xs shrink-0"
          placeholder="Search name / IP / user…"
          value={q}
          onChange={(e) => {
            setPage(0);
            setQ(e.target.value);
          }}
        />

        <div
          className={cn(
            "grid min-h-0 flex-1 gap-3 overflow-hidden",
            panelOpen ? "xl:grid-cols-[minmax(0,1fr)_minmax(420px,520px)]" : ""
          )}
        >
          <Card className="flex min-h-0 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-auto scroll-thin">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="sticky top-0 z-10 border-b bg-muted/95 text-[11px] uppercase text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="px-3 py-2 text-left">Title</th>
                    <th className="px-3 py-2 text-left">IP address</th>
                    <th className="px-3 py-2 text-left">Username</th>
                    <th className="px-3 py-2 text-left">Created on</th>
                    <th className="px-3 py-2 text-left">Agent status</th>
                    <th className="px-3 py-2 text-left">Probe status</th>
                    <th className="px-3 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {appliances.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-xs text-muted-foreground">
                        {loading ? "Loading…" : "No appliances registered"}
                      </td>
                    </tr>
                  )}
                  {appliances.map((a) => (
                    <tr
                      key={a.id}
                      className={cn(
                        "border-b border-border/50 hover:bg-primary/5",
                        selected?.id === a.id && panelOpen && "bg-primary/10"
                      )}
                    >
                      <td className="px-3 py-2.5 font-medium">{a.name}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{a.ip_address}</td>
                      <td className="px-3 py-2.5 text-xs">{a.username || "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {a.created_on ? relativeTime(a.created_on) : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant={a.agent_status === "Running" ? "success" : "secondary"}>
                          {a.agent_status || "Stopped"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge
                          variant={
                            a.probe_status === "Running"
                              ? "success"
                              : a.probe_status === "Degraded"
                                ? "high"
                                : "secondary"
                          }
                        >
                          {a.probe_status || "Stopped"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => openOverview(a)}>
                            <Eye className="mr-1 h-3.5 w-3.5" />
                            Overview
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => remove(a)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={page}
              pageSize={pageSize}
              total={appTotal}
              onPageChange={setPage}
              onPageSizeChange={(s) => {
                setPage(0);
                setPageSize(s);
              }}
            />
          </Card>

          {panelOpen && selected && (
            <div className="min-h-0 overflow-hidden">
              <SpxDetailPanel
                appliance={selected}
                appliances={appliances}
                onClose={() => setPanelOpen(false)}
                onSelect={(a) => setSelected(a)}
                onStatusChange={onStatusChange}
              />
            </div>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md space-y-3">
          <h2 className="text-sm font-semibold">Register Spider-X appliance</h2>
          <p className="text-[11px] text-muted-foreground">
            Credentials are validated against the appliance API on port 19201 before saving.
          </p>
          <div className="space-y-1">
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>IP address *</Label>
            <Input value={form.ip_address} onChange={(e) => setForm({ ...form, ip_address: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Username *</Label>
            <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Password *</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <Button onClick={register} disabled={registering || !form.name || !form.ip_address || !form.password}>
            {registering ? "Validating…" : "Register"}
          </Button>
        </DialogContent>
      </Dialog>
    </PageFrame>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "ok" }) {
  return (
    <div className="ndr-panel px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("truncate text-lg font-semibold", tone === "ok" && "text-severity-success")}>{value}</div>
    </div>
  );
}
