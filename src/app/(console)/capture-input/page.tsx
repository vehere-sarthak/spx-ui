"use client";

import { apiFetch } from "@/lib/api-client";
import * as React from "react";
import { PageFrame } from "@/components/ndr/page-frame";
import { PaginationBar } from "@/components/ndr/pagination-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn, relativeTime } from "@/lib/utils";
import { readSessionUser } from "@/lib/session";
import {
  EMPTY_PB,
  type PbData,
  parseLinkRows,
  postBulkImportPbLinks,
  saveSurveyConfig,
} from "@/lib/link-survey";

const IDENTIFIERS = [
  { label: "VLAN ID", value: "vlan_id", typeLabel: "VLAN ID" },
  { label: "MAC", value: "mac", typeLabel: "MAC" },
  { label: "MPLS", value: "mpls", typeLabel: "MPLS" },
  { label: "IFACE", value: "iface", typeLabel: "IFACE" },
] as const;

type CapType = (typeof IDENTIFIERS)[number]["value"];

type Row = {
  id: string;
  version?: number;
  name?: string;
  type?: string;
  vlan_id?: string[];
  mac?: string[] | string;
  mpls?: string[];
  iface?: string[];
  pbIP?: string;
  pbPort?: string;
  pbType?: string;
  pbDeviceName?: string;
  created_by?: string;
  created_on?: number;
  last_modified_by?: string;
  last_modified_on?: number;
};

type FormState = {
  name: string;
  capinidtype: CapType;
  value: string;
  editingId?: string;
  version?: number;
};

const EMPTY: FormState = { name: "", capinidtype: "vlan_id", value: "" };

const TEXTAREA =
  "flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 font-mono";

function rowValue(r: Row): string {
  if (r.vlan_id?.length) return r.vlan_id.join(", ");
  if (Array.isArray(r.mac)) return r.mac.join(", ");
  if (typeof r.mac === "string" && r.mac) return r.mac;
  if (r.mpls?.length) return r.mpls.join(", ");
  if (r.iface?.length) return r.iface.join(", ");
  return "—";
}

function detectCapType(r: Row): CapType {
  const t = String(r.type || "").toLowerCase();
  if (t.includes("mac") || r.mac) return "mac";
  if (t.includes("mpls") || r.mpls?.length) return "mpls";
  if (t.includes("iface") || r.iface?.length) return "iface";
  return "vlan_id";
}

function firstValue(r: Row): string {
  const v = rowValue(r);
  return v === "—" ? "" : v.split(",")[0].trim();
}

export default function CaptureInputPage() {
  const [items, setItems] = React.useState<Row[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(20);
  const [q, setQ] = React.useState("");
  const [selected, setSelected] = React.useState<Row | null>(null);
  const [checked, setChecked] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(EMPTY);
  const [saving, setSaving] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [pb, setPb] = React.useState<PbData>(EMPTY_PB);
  const [importText, setImportText] = React.useState("");
  const [importing, setImporting] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), query: q });
      const res = await apiFetch(`/capture-input-identification?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setItems(json.items || []);
      setTotal(json.total || 0);
      setSelected((cur) => json.items?.find((x: Row) => x.id === cur?.id) || json.items?.[0] || null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, q]);

  React.useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  function openCreate() {
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(r: Row) {
    setSelected(r);
    setForm({
      name: r.name || "",
      capinidtype: detectCapType(r),
      value: firstValue(r),
      editingId: r.id,
      version: r.version,
    });
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim() || form.name.trim().length < 2) {
      setError("Title must be at least 2 characters");
      return;
    }
    if (!form.value.trim()) {
      setError("Value is required");
      return;
    }
    const meta = IDENTIFIERS.find((x) => x.value === form.capinidtype)!;
    const user = readSessionUser();
    const by = user?.user_id || "spiderx";
    const data: Record<string, unknown> = {
      name: form.name.trim(),
      type: meta.typeLabel,
      [form.capinidtype]: [form.value.trim()],
      created_by: by,
      last_modified_by: by,
    };
    setSaving(true);
    try {
      const res = await apiFetch("/capture-input-identification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          _id: form.editingId,
          _version: form.version,
          data,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      setOpen(false);
      setError(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(ids: string[]) {
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} record(s)?`)) return;
    const res = await apiFetch("/capture-input-identification", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) {
      const json = await res.json();
      setError(json.error || "Delete failed");
      return;
    }
    setChecked(new Set());
    load();
  }

  async function runImport() {
    const rows = parseLinkRows(importText);
    if (!rows.length) {
      setError("Paste CSV/JSON rows (title,value,type) before importing");
      return;
    }
    if (!pb.pbIP.trim()) {
      setError("pbIP is required");
      return;
    }
    setImporting(true);
    try {
      saveSurveyConfig(pb);
      const json = await postBulkImportPbLinks(pb, rows);
      setImportOpen(false);
      setImportText("");
      setError(null);
      load();
      if (json.message) setError(json.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  const valuePlaceholder =
    form.capinidtype === "vlan_id"
      ? "e.g. 100"
      : form.capinidtype === "mac"
        ? "e.g. AA:BB:CC:DD:EE:FF"
        : form.capinidtype === "mpls"
          ? "e.g. 16001"
          : "e.g. eth0";

  return (
    <PageFrame
      title="Capture Input Identification"
      subtitle={`${total.toLocaleString()} records${loading ? " · loading…" : ""}`}
      actions={
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            Import (Link Survey)
          </Button>
          <Button size="sm" variant="outline" disabled={!checked.size} onClick={() => remove(Array.from(checked))}>
            Delete
          </Button>
          <Button size="sm" onClick={openCreate}>
            Create
          </Button>
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
        {error && (
          <div className="shrink-0 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
            {error}
          </div>
        )}
        <Input
          className="max-w-sm shrink-0"
          placeholder="Search title, type, value…"
          value={q}
          onChange={(e) => {
            setPage(0);
            setQ(e.target.value);
          }}
        />
        <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-[1.4fr_1fr]">
          <Card className="flex min-h-0 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-auto scroll-thin">
              <table className="w-full min-w-[780px] text-sm">
                <thead className="sticky top-0 border-b bg-muted/90 text-[11px] uppercase text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="w-8 px-2 py-2" />
                    <th className="px-3 py-2 text-left">Title</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-left">Value</th>
                    <th className="px-3 py-2 text-left">Created</th>
                    <th className="px-3 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setSelected(r)}
                      className={cn(
                        "cursor-pointer border-b border-border/50 hover:bg-primary/5",
                        selected?.id === r.id && "bg-primary/10"
                      )}
                    >
                      <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checked.has(r.id)}
                          onChange={(e) => {
                            setChecked((prev) => {
                              const n = new Set(prev);
                              if (e.target.checked) n.add(r.id);
                              else n.delete(r.id);
                              return n;
                            });
                          }}
                        />
                      </td>
                      <td className="px-3 py-2.5 font-medium">{r.name}</td>
                      <td className="px-3 py-2.5">
                        <Badge variant="secondary">{r.type || detectCapType(r)}</Badge>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs">{rowValue(r)}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {r.created_by || "—"}
                        {r.created_on ? ` · ${relativeTime(r.created_on)}` : ""}
                      </td>
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                            Edit
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => remove([r.id])}>
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!items.length && !loading && (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                        No capture input records
                      </td>
                    </tr>
                  )}
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
          <Card className="overflow-auto p-4 text-sm scroll-thin">
            <div className="mb-3 text-base font-semibold">{selected?.name || "Select a record"}</div>
            {selected && (
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Type</dt>
                  <dd>{selected.type}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Value</dt>
                  <dd className="font-mono">{rowValue(selected)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Created by</dt>
                  <dd>{selected.created_by || "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Modified by</dt>
                  <dd>{selected.last_modified_by || "—"}</dd>
                </div>
                <div className="pt-2 font-mono text-[10px] text-muted-foreground break-all">{selected.id}</div>
              </dl>
            )}
          </Card>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <div className="space-y-4">
            <h3 className="text-base font-semibold">
              {form.editingId ? "Edit" : "Create"} capture input identification
            </h3>
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input
                value={form.name}
                maxLength={32}
                placeholder="2–32 characters"
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type *</Label>
              <Select
                value={form.capinidtype}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, capinidtype: v as CapType, value: "" }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IDENTIFIERS.map((x) => (
                    <SelectItem key={x.value} value={x.value}>
                      {x.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Value *</Label>
              <Input
                value={form.value}
                placeholder={valuePlaceholder}
                onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving || !form.name.trim() || !form.value.trim()}>
                {saving ? "Saving…" : form.editingId ? "Update" : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-lg">
          <div className="max-h-[80vh] space-y-3 overflow-auto pr-1">
            <h3 className="text-base font-semibold">Import (Link Survey)</h3>
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
              <Label>Rows (CSV / JSON)</Label>
              <textarea
                className={TEXTAREA}
                placeholder={'title,value,type\nvlan-100,100,vlan_id\n\nor JSON: [{"title":"…","value":"…","type":"vlan_id"}]'}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setImportOpen(false)}>
                Cancel
              </Button>
              <Button onClick={runImport} disabled={importing}>
                {importing ? "Importing…" : "Import"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </PageFrame>
  );
}
