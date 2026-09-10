"use client";

import { apiFetch } from "@/lib/api-client";
import * as React from "react";
import { PageFrame } from "@/components/ndr/page-frame";
import { DateRangeBar, useDateRange } from "@/components/ndr/date-range-bar";
import { PaginationBar } from "@/components/ndr/pagination-bar";
import { MiniBars } from "@/components/ndr/charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn, relativeTime } from "@/lib/utils";
import { readSessionUser } from "@/lib/session";
import { HexBufferViewer, DecodeTree } from "@/components/ndr/hex-buffer-viewer";
import {
  AdvancedFilterPanel,
  AdvancedRule,
  rulesToQuery,
  selectedParam,
} from "@/components/ndr/advanced-filter-panel";

type Target = {
  id: string;
  alias?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  priority?: string;
  enabled?: boolean;
  values?: string[];
  created_by?: string;
  created_on?: number;
  last_modified_by?: string;
  last_modified_on?: number;
  activeFrom?: string | number;
  validTill?: string | number;
  activeFromTZ?: string;
  validTillTZ?: string;
  description?: string;
  assignTo?: string[];
  shared?: string[];
  condition?: string;
  importName?: string;
};

type Tab = "details" | "activity" | "frames";
type ProbeRule = { id: string; field: string; condition: string; value: string };

type FormState = {
  alias: string;
  firstName: string;
  lastName: string;
  priority: string;
  description: string;
  rules: ProbeRule[];
  activeFromTZ: string;
  validTillTZ: string;
  assignTo: string[];
};

const EMPTY_FORM: FormState = {
  alias: "",
  firstName: "",
  lastName: "",
  priority: "medium",
  description: "",
  rules: [{ id: "r1", field: "email_id", condition: "ct-match-all", value: "" }],
  activeFromTZ: new Date().toISOString().slice(0, 16),
  validTillTZ: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 16),
  assignTo: [],
};

const FIELDS = [
  { value: "email_id", label: "Email" },
  { value: "ip", label: "IP" },
  { value: "msisdn", label: "MSISDN / Phone" },
  { value: "imsi", label: "IMSI" },
  { value: "imei", label: "IMEI" },
  { value: "url", label: "URL" },
  { value: "domain", label: "Domain" },
  { value: "username", label: "Username" },
  { value: "keyword", label: "Keyword" },
  { value: "mac", label: "MAC" },
  { value: "ja3", label: "JA3" },
  { value: "ja3s", label: "JA3S" },
];

const RULE_CONDITIONS = [
  { value: "ct-match-all", label: "Match all" },
  { value: "is", label: "Equals" },
  { value: "is not", label: "Not equals" },
  { value: "is one of", label: "Is one of" },
  { value: "wildcard", label: "Wildcard" },
  { value: "exists", label: "Exists" },
  { value: "not exists", label: "Not exists" },
];

function toLocalInput(iso?: string | number) {
  if (!iso) return new Date().toISOString().slice(0, 16);
  const d = typeof iso === "number" ? new Date(iso * (iso < 1e12 ? 1000 : 1)) : new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 16);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseConditionRules(condition?: string, values?: string[]): ProbeRule[] {
  if (condition) {
    try {
      const parsed = JSON.parse(condition);
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map((item: any, i: number) => {
          const match = item?.match || item?.term || {};
          const field = Object.keys(match)[0] || "keyword";
          const raw = match[field];
          const value =
            typeof raw === "object" && raw?.query != null
              ? String(raw.query)
              : typeof raw === "string"
                ? raw
                : Array.isArray(raw)
                  ? raw.join(",")
                  : "";
          return {
            id: `r-${i}-${Date.now()}`,
            field,
            condition: item?.match ? "ct-match-all" : "is",
            value,
          };
        });
      }
    } catch {
      /* fall through */
    }
  }
  if (values?.length) {
    return values.map((v, i) => ({
      id: `r-${i}`,
      field: "keyword",
      condition: "ct-match-all",
      value: v,
    }));
  }
  return [{ id: "r1", field: "email_id", condition: "ct-match-all", value: "" }];
}

function buildPayload(form: FormState) {
  const activeRules = form.rules.filter(
    (r) => r.field && (r.value.trim() || r.condition === "exists" || r.condition === "not exists")
  );
  const targetValue = activeRules
    .filter((r) => r.value.trim())
    .flatMap((r) => r.value.split(/[\n,|]/).map((s) => s.trim()).filter(Boolean));

  const condition = JSON.stringify(
    activeRules.map((r) => {
      if (r.condition === "exists") return { exists: { field: r.field } };
      if (r.condition === "not exists") return { bool: { must_not: [{ exists: { field: r.field } }] } };
      if (r.condition === "ct-match-all" || r.condition === "match all") {
        return { match: { [r.field]: { query: r.value.trim(), operator: "and" } } };
      }
      if (r.condition === "is one of") {
        return { terms: { [r.field]: r.value.split(/[\n,|]/).map((s) => s.trim()).filter(Boolean) } };
      }
      if (r.condition === "wildcard") return { wildcard: { [r.field]: r.value.trim() } };
      if (r.condition === "is not") return { bool: { must_not: [{ term: { [r.field]: r.value.trim() } }] } };
      return { term: { [r.field]: r.value.trim() } };
    })
  );

  return {
    personalInfo: {
      alias: form.alias.trim(),
      firstName: form.firstName,
      lastName: form.lastName,
      priority: form.priority,
      description: form.description,
    },
    targetValue,
    condition,
    interceptionCriteria: {
      assignTo: form.assignTo,
    },
    assignTo: form.assignTo,
    activeFromTZ: new Date(form.activeFromTZ).toISOString(),
    validTillTZ: new Date(form.validTillTZ).toISOString(),
    enabled: true,
  };
}

export default function TargetsPage() {
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState<string[]>(["all"]);
  const [priority, setPriority] = React.useState<string[]>(["all"]);
  const [rules, setRules] = React.useState<AdvancedRule[]>([]);
  const [filterOpen, setFilterOpen] = React.useState(true);
  const [sortOn, setSortOn] = React.useState("created_on");
  const [sortDir, setSortDir] = React.useState("desc");
  const [items, setItems] = React.useState<Target[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(100);
  const [counts, setCounts] = React.useState<any>({});
  const [selected, setSelected] = React.useState<Target | null>(null);
  const [checked, setChecked] = React.useState<Set<string>>(new Set());
  const [tab, setTab] = React.useState<Tab>("details");
  const [activity, setActivity] = React.useState<any[]>([]);
  const [activityDays, setActivityDays] = React.useState<any[]>([]);
  const [activityTotal, setActivityTotal] = React.useState(0);
  const [frames, setFrames] = React.useState<any[]>([]);
  const [framesTotal, setFramesTotal] = React.useState(0);
  const [soi, setSoi] = React.useState<any>(null);
  const [frameDetail, setFrameDetail] = React.useState<any | null>(null);
  const [decodeTree, setDecodeTree] = React.useState<any>(null);
  const [range, setRange] = useDateRange("now-7d");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [toggling, setToggling] = React.useState<string | null>(null);
  const [dialog, setDialog] = React.useState<"create" | "edit" | "import" | "share" | null>(null);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [users, setUsers] = React.useState<string[]>([]);
  const [shareIds, setShareIds] = React.useState<string[]>([]);
  const [importText, setImportText] = React.useState("");
  const [importName, setImportName] = React.useState(`import-${Date.now()}`);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        query: q,
        status: selectedParam(status),
        priority: selectedParam(priority),
        sortOn,
        sortDir,
      });
      const adv = rulesToQuery(rules);
      if (adv) params.set("advanced", adv);
      const res = await apiFetch(`/target-managements?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setItems(json.items || json.details || []);
      setTotal(json.total || json.totalCount || 0);
      setCounts(json.counts || {
        all: json.allCount,
        active: json.activeCount,
        inactive: json.inActiveCount,
        high: json.highPriorityCount,
        medium: json.mediumPriorityCount,
        low: json.lowPriorityCount,
      });
      setSelected((cur) => {
        const list = json.items || json.details || [];
        return list.find((t: Target) => t.id === cur?.id) || list[0] || null;
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [q, status, priority, rules, page, pageSize, sortOn, sortDir]);

  React.useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  React.useEffect(() => {
    apiFetch("/users?pageSize=200", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setUsers((j.items || []).map((u: any) => u.user_id).filter(Boolean)))
      .catch(() => setUsers([]));
  }, []);

  React.useEffect(() => {
    if (!selected || tab === "details") return;
    let cancelled = false;
    (async () => {
      try {
        if (tab === "activity") {
          const name = selected.alias || selected.name || "";
          const params = new URLSearchParams({
            targetName: name,
            targetId: selected.id,
            startTime: range.startTime,
            endTime: range.endTime,
            pageSize: "50",
          });
          const [actRes, soiRes] = await Promise.all([
            apiFetch(`/target-managements/activity?${params}`, { cache: "no-store" }),
            apiFetch(
              `/target-managements/soi-stats?targetId=${encodeURIComponent(selected.id)}&startTime=${encodeURIComponent(range.startTime)}&endTime=${encodeURIComponent(range.endTime)}`,
              { cache: "no-store" }
            ),
          ]);
          const act = await actRes.json();
          const soiJson = await soiRes.json();
          if (!cancelled) {
            setActivity(act.items || []);
            setActivityDays(act.details || []);
            setActivityTotal(act.total || 0);
            setSoi(soiJson.error ? null : soiJson);
          }
        } else if (tab === "frames") {
          const params = new URLSearchParams({
            targetId: selected.id,
            startTime: range.startTime,
            endTime: range.endTime,
            pageSize: "50",
          });
          const res = await apiFetch(`/target-managements/frames?${params}`, { cache: "no-store" });
          const json = await res.json();
          if (!cancelled) {
            setFrames(json.items || json.rows || []);
            setFramesTotal(json.total || json.totalCount || 0);
            setFrameDetail(null);
          }
        }
      } catch {
        if (!cancelled) {
          setActivity([]);
          setFrames([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected, tab, range]);

  async function toggle(t: Target, enabled: boolean) {
    try {
      setToggling(t.id);
      const res = await apiFetch("/target-managements/toggle-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _id: t.id, enabled }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Toggle failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Toggle failed");
    } finally {
      setToggling(null);
    }
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setDialog("create");
  }

  function openEdit() {
    if (!selected) return;
    setForm({
      alias: selected.alias || "",
      firstName: selected.firstName || "",
      lastName: selected.lastName || "",
      priority: (selected.priority || "medium").toLowerCase(),
      description: selected.description || "",
      rules: parseConditionRules(selected.condition, selected.values),
      activeFromTZ: toLocalInput(selected.activeFromTZ || selected.activeFrom),
      validTillTZ: toLocalInput(selected.validTillTZ || selected.validTill),
      assignTo: selected.assignTo || [],
    });
    setDialog("edit");
  }

  async function save() {
    const payload = buildPayload(form);
    const user = readSessionUser();
    const by = user?.user_id || "spiderx";
    const isEdit = dialog === "edit" && selected;
    const res = await apiFetch("/target-managements", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        _id: isEdit ? selected!.id : undefined,
        data: { ...payload, created_by: by, last_modified_by: by },
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Save failed");
      return;
    }
    setDialog(null);
    setPage(0);
    load();
  }

  async function removeSelected() {
    const ids = checked.size ? Array.from(checked) : selected ? [selected.id] : [];
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} target(s)?`)) return;
    const res = await apiFetch("/target-managements", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) {
      setError((await res.json()).error || "Delete failed");
      return;
    }
    setChecked(new Set());
    load();
  }

  async function exportCsv() {
    const params = new URLSearchParams({
      query: q,
      status: selectedParam(status),
      priority: selectedParam(priority),
      pageSize: "5000",
    });
    if (checked.size) params.set("ids", Array.from(checked).join(","));
    const res = await apiFetch(`/target-managements/export?${params}`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Export failed");
      return;
    }
    const rows = json.details || [];
    const header = ["alias", "firstName", "lastName", "priority", "status", "values", "created_by", "validTill", "description", "id"];
    const csv = [
      header.join(","),
      ...rows.map((r: any) =>
        header
          .map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`)
          .join(",")
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `targets-export-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function runImport() {
    const lines = importText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    // CSV: alias,priority,values,firstName,lastName,description
    const rows = lines
      .filter((l) => !l.toLowerCase().startsWith("alias,"))
      .map((line) => {
        const parts = line.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
        const [alias, pri, values, firstName, lastName, description] = parts;
        return {
          alias,
          priority: pri || "medium",
          values: (values || "").split("|").filter(Boolean),
          firstName: firstName || "",
          lastName: lastName || "",
          description: description || "",
          importName,
        };
      })
      .filter((r) => r.alias);
    const res = await apiFetch("/target-managements/bulk-import-target", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: rows, importName, created_by: readSessionUser()?.user_id || "spiderx" }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Import failed");
      return;
    }
    setDialog(null);
    setImportText("");
    load();
    if (json.failedRecords?.length) {
      setError(`Imported ${json.insertedCount}; ${json.failedRecords.length} failed`);
    }
  }

  async function share() {
    if (!selected) return;
    const res = await apiFetch("/target-managements/share-target", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetId: selected.id, userIds: shareIds.length ? shareIds : ["All"] }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Share failed");
      return;
    }
    setDialog(null);
    load();
  }

  async function decodeFrame(hexdump: string) {
    const res = await apiFetch("/target-managements/frames/decode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hexdump }),
    });
    const json = await res.json();
    setDecodeTree(json.details || json);
  }

  function toggleCheck(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function resetFilters() {
    setQ("");
    setStatus(["all"]);
    setPriority(["all"]);
    setRules([]);
    setSortOn("created_on");
    setSortDir("desc");
    setPage(0);
    setChecked(new Set());
  }

  return (
    <PageFrame
      title="Target Management"
      meta={
        loading
          ? "Loading…"
          : `${total.toLocaleString()} · ${counts.active ?? "—"} active · ${counts.inactive ?? "—"} inactive`
      }
      actions={
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" onClick={openCreate}>Create</Button>
          <Button size="sm" variant="outline" disabled={!selected} onClick={openEdit}>Edit</Button>
          <Button size="sm" variant="outline" onClick={() => setDialog("import")}>Import</Button>
          <Button size="sm" variant="outline" onClick={exportCsv}>Export</Button>
          <Button size="sm" variant="outline" disabled={!selected} onClick={() => {
            setShareIds(selected?.shared || []);
            setDialog("share");
          }}>Share</Button>
          <Button size="sm" variant="outline" onClick={removeSelected} disabled={!checked.size && !selected}>
            Delete
          </Button>
          <Button size="sm" variant="ghost" onClick={resetFilters}>Reset</Button>
        </div>
      }
    >
      <div className="flex h-full min-h-0 gap-3 overflow-hidden">
        <AdvancedFilterPanel
          open={filterOpen}
          onOpenChange={setFilterOpen}
          groups={[
            {
              id: "status",
              label: "Status",
              selected: status,
              onChange: (v) => { setPage(0); setStatus(v); },
              options: [
                { key: "active", label: "Active", count: counts.active },
                { key: "inactive", label: "Inactive", count: counts.inactive },
              ],
            },
            {
              id: "priority",
              label: "Priority",
              selected: priority,
              onChange: (v) => { setPage(0); setPriority(v); },
              options: [
                { key: "high", label: "High", count: counts.high },
                { key: "medium", label: "Medium", count: counts.medium },
                { key: "low", label: "Low", count: counts.low },
              ],
            },
          ]}
          advancedFields={[
            { id: "alias", label: "Alias" },
            { id: "firstName", label: "First name" },
            { id: "lastName", label: "Last name" },
            { id: "priority", label: "Priority" },
            { id: "targetValue", label: "Target value" },
            { id: "created_by", label: "Created by" },
            { id: "description", label: "Description" },
          ]}
          rules={rules}
          onRulesChange={setRules}
          onReset={resetFilters}
          onApply={() => { setPage(0); load(); }}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
        {error && (
          <div className="shrink-0 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
            {error}
          </div>
        )}

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            className="sm:max-w-sm"
            placeholder="Search alias, name, value…"
            value={q}
            onChange={(e) => { setPage(0); setQ(e.target.value); }}
          />
          <Select value={`${sortOn}:${sortDir}`} onValueChange={(v) => {
            const [on, dir] = v.split(":");
            setSortOn(on);
            setSortDir(dir);
            setPage(0);
          }}>
            <SelectTrigger className="sm:w-48">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created_on:desc">Newest created</SelectItem>
              <SelectItem value="created_on:asc">Oldest created</SelectItem>
              <SelectItem value="last_modified_on:desc">Recently modified</SelectItem>
              <SelectItem value="name:asc">Alias A–Z</SelectItem>
              <SelectItem value="name:desc">Alias Z–A</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-[1.35fr_1fr]">
          <Card className="flex min-h-0 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-auto scroll-thin">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="sticky top-0 z-10 border-b bg-muted/90 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="w-8 px-2 py-2" />
                    <th className="px-3 py-2 text-left">Alias</th>
                    <th className="px-3 py-2 text-left">Priority</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Values</th>
                    <th className="px-3 py-2 text-left">Owner</th>
                    <th className="px-3 py-2 text-left">Valid till</th>
                    <th className="px-3 py-2 text-left">Enable</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-10 text-center text-xs text-muted-foreground">
                        {loading ? "Loading…" : "No targets"}
                      </td>
                    </tr>
                  )}
                  {items.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => { setSelected(t); setTab("details"); }}
                      className={cn(
                        "cursor-pointer border-b border-border/50 hover:bg-primary/5",
                        selected?.id === t.id && "bg-primary/10"
                      )}
                    >
                      <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={checked.has(t.id)} onChange={() => toggleCheck(t.id)} />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium">{t.alias || t.name}</div>
                        <div className="truncate text-[10px] text-muted-foreground">{t.description}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant={(t.priority as "low") || "secondary"}>{t.priority || "-"}</Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant={t.enabled ? "success" : "secondary"}>
                          {t.enabled ? "active" : "inactive"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px]">
                        {(t.values || []).slice(0, 2).join(", ")}
                        {(t.values || []).length > 2 ? ` +${(t.values || []).length - 2}` : ""}
                      </td>
                      <td className="px-3 py-2.5 text-xs">{t.created_by}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {typeof t.validTill === "string" ? t.validTill.slice(0, 10) : t.validTill || "—"}
                      </td>
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <Switch
                          checked={!!t.enabled}
                          disabled={toggling === t.id}
                          onCheckedChange={(v) => toggle(t, v)}
                        />
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
              pageSizeOptions={[50, 100, 500, 1500, 2000]}
              onPageChange={setPage}
              onPageSizeChange={(s) => { setPage(0); setPageSize(s); }}
            />
          </Card>

          <Card className="flex min-h-0 flex-col overflow-hidden">
            <CardHeader className="shrink-0 space-y-2 pb-2">
              <CardTitle className="text-sm">{selected?.alias || selected?.name || "Select a target"}</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-1">
                  {(["details", "activity", "frames"] as Tab[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-[11px] capitalize",
                        tab === t ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                {(tab === "activity" || tab === "frames") && (
                  <DateRangeBar
                    value={range}
                    onChange={setRange}
                    presets={["now-1d", "now-7d", "now-30d", "custom"]}
                  />
                )}
              </div>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 space-y-2 overflow-auto scroll-thin text-xs">
              {!selected && <p className="text-muted-foreground">Pick a row</p>}
              {selected && tab === "details" && (
                <>
                  <Row k="Name" v={selected.name || "—"} />
                  <Row k="Priority" v={selected.priority || "—"} />
                  <Row k="Enabled" v={selected.enabled ? "true" : "false"} />
                  <Row k="Values" v={(selected.values || []).join(", ") || "—"} />
                  <Row k="Assign to" v={(selected.assignTo || []).join(", ") || "—"} />
                  <Row k="Shared with" v={(selected.shared || []).join(", ") || "—"} />
                  <Row k="Active from" v={String(selected.activeFrom || "—")} />
                  <Row k="Valid till" v={String(selected.validTill || "—")} />
                  <Row k="Created by" v={selected.created_by || "—"} />
                  <Row k="Modified by" v={selected.last_modified_by || "—"} />
                  <Row k="Import" v={selected.importName || "—"} />
                  <Row k="Description" v={selected.description || "—"} />
                  <Row k="Document id" v={selected.id} />
                  {selected.condition && (
                    <div className="mt-2 rounded-md border border-border/50 bg-muted/30 p-2 font-mono text-[10px]">
                      {selected.condition}
                    </div>
                  )}
                </>
              )}
              {selected && tab === "activity" && (
                <>
                  <p className="text-muted-foreground">
                    {activityTotal.toLocaleString()} hits · SOI total {soi?.totalHits ?? 0}
                  </p>
                  {soi && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <StatChart title="Links" data={soi.linkNames || []} />
                      <StatChart title="Hosts" data={soi.hosts || []} />
                      <StatChart title="Countries" data={soi.countries || []} />
                      <StatChart title="Priority" data={soi.priorities || []} />
                    </div>
                  )}
                  {activityDays.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[11px] font-medium text-muted-foreground">By day</div>
                      {activityDays.map((d) => (
                        <div key={d.date} className="ndr-inset p-2">
                          <div className="font-medium">{String(d.date).slice(0, 10)} · hits {d.hits || d.count}</div>
                          <div className="text-muted-foreground">
                            {(d.types || []).map((t: any) => `${t.type}:${t.count}`).join(" · ") || "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {activity.map((a) => (
                    <div key={a.id} className="ndr-inset p-2">
                      <div className="font-medium">{a.filter_names || a.matched_value || a.value || a.id}</div>
                      <div className="text-muted-foreground">
                        {a.ts ? relativeTime(a.ts) : "—"} · {a.link_name || "—"} · hit {a.hit_count ?? "—"}
                      </div>
                    </div>
                  ))}
                  {!activity.length && !activityDays.length && (
                    <p className="text-muted-foreground">No activity in this window</p>
                  )}
                </>
              )}
              {selected && tab === "frames" && (
                <>
                  <p className="text-muted-foreground">{framesTotal.toLocaleString()} frames</p>
                  {frames.length === 0 && <p className="text-muted-foreground">No frames</p>}
                  {frames.map((f) => (
                    <button
                      key={f.id}
                      className="ndr-inset block w-full p-2 text-left hover:border-primary/40"
                      onClick={() => {
                        setFrameDetail(f);
                        setDecodeTree(null);
                        if (f.hexdump) decodeFrame(f.hexdump);
                      }}
                    >
                      <div className="font-mono text-[10px]">{f.id}</div>
                      <div className="text-muted-foreground">
                        {f.ts ? relativeTime(f.ts) : "—"} · {f.link_name || "—"} · {f.iface || "—"} · len {f.length ?? "—"}
                      </div>
                      <div className="font-mono text-[10px]">
                        {f.src_ip || "—"} → {f.dst_ip || "—"}
                      </div>
                    </button>
                  ))}
                  {frameDetail && (
                    <div className="mt-2 space-y-2 rounded-md border border-border/50 p-2">
                      <div className="text-[11px] font-medium">PCAP / frame viewer</div>
                      {decodeTree && (
                        <div className="max-h-40 overflow-auto scroll-thin rounded border border-border/40 p-2">
                          <DecodeTree details={decodeTree} />
                        </div>
                      )}
                      <HexBufferViewer hex={frameDetail.hexdump || ""} className="max-h-56" />
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
        </div>
      </div>

      <Dialog open={dialog === "create" || dialog === "edit"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-h-[92vh] max-w-2xl space-y-0 overflow-hidden p-0">
          <div className="border-b border-border/60 px-4 py-3">
            <h2 className="text-sm font-semibold">{dialog === "edit" ? "Edit target" : "Create target"}</h2>
            <p className="text-[11px] text-muted-foreground">
              Personal info · interception criteria · assignment
            </p>
          </div>
          <div className="max-h-[calc(92vh-7rem)] space-y-3 overflow-auto px-4 py-3 scroll-thin">
            <section className="space-y-2 rounded-lg border border-border/60 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Personal information
              </h3>
              <div className="space-y-1">
                <Label>Alias *</Label>
                <Input
                  value={form.alias}
                  onChange={(e) => setForm({ ...form, alias: e.target.value })}
                  disabled={dialog === "edit"}
                  placeholder="2–50 alphanumeric"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>First name</Label>
                  <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Last name</Label>
                  <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Priority *</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
            </section>

            <section className="space-y-2 rounded-lg border border-border/60 p-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Interception criteria
                </h3>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      rules: [
                        ...form.rules,
                        { id: `r-${Date.now()}`, field: "email_id", condition: "ct-match-all", value: "" },
                      ],
                    })
                  }
                >
                  Add filter
                </Button>
              </div>
              <div className="space-y-2">
                {form.rules.map((rule, idx) => (
                  <div key={rule.id} className="grid gap-2 rounded-md bg-muted/30 p-2 sm:grid-cols-[1fr_1fr_1.2fr_auto]">
                    <Select
                      value={rule.field}
                      onValueChange={(v) =>
                        setForm({
                          ...form,
                          rules: form.rules.map((r) => (r.id === rule.id ? { ...r, field: v } : r)),
                        })
                      }
                    >
                      <SelectTrigger className="h-9"><SelectValue placeholder="Field" /></SelectTrigger>
                      <SelectContent>
                        {FIELDS.map((f) => (
                          <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={rule.condition}
                      onValueChange={(v) =>
                        setForm({
                          ...form,
                          rules: form.rules.map((r) => (r.id === rule.id ? { ...r, condition: v } : r)),
                        })
                      }
                    >
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {RULE_CONDITIONS.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      className="h-9"
                      placeholder={rule.condition.includes("exists") ? "—" : "Value"}
                      disabled={rule.condition === "exists" || rule.condition === "not exists"}
                      value={rule.value}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          rules: form.rules.map((r) => (r.id === rule.id ? { ...r, value: e.target.value } : r)),
                        })
                      }
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      type="button"
                      disabled={form.rules.length <= 1}
                      onClick={() =>
                        setForm({ ...form, rules: form.rules.filter((r) => r.id !== rule.id) })
                      }
                    >
                      Remove
                    </Button>
                    {idx === 0 && (
                      <p className="sm:col-span-4 text-[10px] text-muted-foreground">
                        Multiple values: separate with comma or |. Match all builds probe capture filters like vehere-ui.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-2 rounded-lg border border-border/60 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Assignment criteria
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>Active from *</Label>
                  <Input
                    type="datetime-local"
                    value={form.activeFromTZ}
                    onChange={(e) => setForm({ ...form, activeFromTZ: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Valid till *</Label>
                  <Input
                    type="datetime-local"
                    value={form.validTillTZ}
                    onChange={(e) => setForm({ ...form, validTillTZ: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Assign to</Label>
                <div className="max-h-36 space-y-1 overflow-auto rounded-md border border-border/50 p-2 scroll-thin">
                  {!users.length && (
                    <p className="text-[11px] text-muted-foreground">No users loaded</p>
                  )}
                  {users.map((u) => (
                    <label key={u} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={form.assignTo.includes(u)}
                        onChange={(e) => {
                          setForm({
                            ...form,
                            assignTo: e.target.checked
                              ? [...form.assignTo, u]
                              : form.assignTo.filter((x) => x !== u),
                          });
                        }}
                      />
                      {u}
                    </label>
                  ))}
                </div>
              </div>
            </section>
          </div>
          <div className="flex justify-end gap-2 border-t border-border/60 px-4 py-3">
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              onClick={save}
              disabled={
                !form.alias.trim() ||
                !form.priority ||
                !form.rules.some((r) => r.value.trim() || r.condition.includes("exists"))
              }
            >
              {dialog === "edit" ? "Update" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "import"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-lg space-y-3">
          <h2 className="text-sm font-semibold">Import targets (CSV)</h2>
          <p className="text-[11px] text-muted-foreground">
            Columns: alias,priority,values,firstName,lastName,description — values use | for multiple
          </p>
          <Input value={importName} onChange={(e) => setImportName(e.target.value)} placeholder="Import name" />
          <textarea
            className="min-h-[160px] w-full rounded-md border border-border bg-background p-2 font-mono text-xs"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={"alias,priority,values,firstName,lastName,description\ntarget1,high,a@b.com|1.2.3.4,John,Doe,demo"}
          />
          <Button onClick={runImport} disabled={!importText.trim()}>Import</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "share"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-md space-y-3">
          <h2 className="text-sm font-semibold">Share target</h2>
          <div className="max-h-60 space-y-1 overflow-auto scroll-thin">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={shareIds.includes("All")}
                onChange={(e) => setShareIds(e.target.checked ? ["All"] : [])}
              />
              All users
            </label>
            {users.map((u) => (
              <label key={u} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={!shareIds.includes("All") && shareIds.includes(u)}
                  onChange={(e) => {
                    setShareIds((prev) => {
                      const withoutAll = prev.filter((x) => x !== "All");
                      if (e.target.checked) return [...withoutAll, u];
                      return withoutAll.filter((x) => x !== u);
                    });
                  }}
                />
                {u}
              </label>
            ))}
          </div>
          <Button onClick={share}>Save sharing</Button>
        </DialogContent>
      </Dialog>
    </PageFrame>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/40 py-1.5 last:border-0">
      <span className="shrink-0 text-muted-foreground">{k}</span>
      <span className="max-w-[65%] break-all text-right font-medium">{v}</span>
    </div>
  );
}

function StatChart({ title, data }: { title: string; data: { key: string; count: number }[] }) {
  if (!data?.length) {
    return (
      <div className="ndr-inset p-2">
        <div className="mb-1 text-[11px] text-muted-foreground">{title}</div>
        <div className="text-[10px] text-muted-foreground">No data</div>
      </div>
    );
  }
  return (
    <div className="ndr-inset p-2">
      <div className="mb-1 text-[11px] text-muted-foreground">{title}</div>
      <div className="h-24">
        <MiniBars
          horizontal
          className="h-full"
          data={data.slice(0, 6).map((d) => ({ label: String(d.key).slice(0, 10), value: d.count }))}
        />
      </div>
    </div>
  );
}
