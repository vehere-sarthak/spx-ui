"use client";

import { apiFetch } from "@/lib/api-client";
import * as React from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageFrame } from "@/components/ndr/page-frame";
import { DateRangeBar, useDateRange } from "@/components/ndr/date-range-bar";
import { PaginationBar } from "@/components/ndr/pagination-bar";
import { cn, relativeTime } from "@/lib/utils";

type AuditRow = {
  id: string;
  ts?: string;
  username?: string;
  clientIp?: string;
  category?: string;
  module?: string;
  event?: string;
  message?: string;
  [key: string]: unknown;
};

function toggleValue(selected: string[], value: string): string[] {
  if (value === "all") return ["all"];
  const withoutAll = selected.filter((v) => v !== "all");
  if (withoutAll.includes(value)) {
    const next = withoutAll.filter((v) => v !== value);
    return next.length ? next : ["all"];
  }
  return [...withoutAll, value];
}

function toCsv(rows: AuditRow[]) {
  const header = ["id", "ts", "username", "clientIp", "category", "module", "event", "message"];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      header
        .map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`)
        .join(",")
    ),
  ];
  return lines.join("\n");
}

export default function AuditPage() {
  const [items, setItems] = React.useState<AuditRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(50);
  const [q, setQ] = React.useState("");
  const [category, setCategory] = React.useState<string[]>(["all"]);
  const [categoryOptions, setCategoryOptions] = React.useState<{ key: string; count?: number }[]>([]);
  const [range, setRange] = useDateRange("now-30d");
  const [selected, setSelected] = React.useState<AuditRow | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [exporting, setExporting] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        startTime: range.startTime,
        endTime: range.endTime,
        query: q,
      });
      const cat = category.filter((c) => c !== "all");
      if (cat.length) params.set("category", cat.join(","));
      const res = await apiFetch(`/audittrail?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      const nextItems: AuditRow[] = json.items || [];
      setItems(nextItems);
      setTotal(json.total || 0);

      const aggBuckets = (json.aggs?.by_category || json.aggs?.category || []) as {
        key: string;
        doc_count?: number;
      }[];
      if (aggBuckets.length) {
        setCategoryOptions(
          aggBuckets.map((b) => ({ key: String(b.key), count: b.doc_count }))
        );
      } else {
        const counts = new Map<string, number>();
        for (const row of nextItems) {
          const c = String(row.category || row.module || "").trim();
          if (!c) continue;
          counts.set(c, (counts.get(c) || 0) + 1);
        }
        setCategoryOptions(
          Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([key, count]) => ({ key, count }))
        );
      }

      setSelected((cur) => {
        if (cur && nextItems.some((r) => r.id === cur.id)) {
          return nextItems.find((r) => r.id === cur.id) || cur;
        }
        return cur;
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, range, q, category]);

  React.useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function exportCsv() {
    try {
      setExporting(true);
      const params = new URLSearchParams({
        page: "0",
        pageSize: "5000",
        startTime: range.startTime,
        endTime: range.endTime,
        query: q,
      });
      const cat = category.filter((c) => c !== "all");
      if (cat.length) params.set("category", cat.join(","));
      const res = await apiFetch(`/audittrail?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Export failed");
      const rows: AuditRow[] = json.items?.length ? json.items : items;
      const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-export-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <PageFrame
      title="Audit Trail"
      meta={`${total.toLocaleString()} events${loading ? " · loading…" : ""}`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={exporting} onClick={exportCsv}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
          <DateRangeBar
            value={range}
            onChange={(v) => {
              setPage(0);
              setRange(v);
            }}
            presets={["now-1d", "now-7d", "now-30d", "custom"]}
          />
        </div>
      }
    >
      <div className="flex h-full min-h-0 gap-3 overflow-hidden">
        <aside className="flex w-52 shrink-0 flex-col overflow-hidden rounded-lg border border-border/70 bg-card">
          <div className="border-b border-border/50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Category
            </p>
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-auto p-2 scroll-thin">
            <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted/60">
              <input
                type="checkbox"
                checked={category.includes("all") || category.length === 0}
                onChange={() => {
                  setPage(0);
                  setCategory(["all"]);
                }}
              />
              All
            </label>
            {categoryOptions.map((opt) => (
              <label
                key={opt.key}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted/60"
              >
                <input
                  type="checkbox"
                  checked={category.includes(opt.key)}
                  onChange={() => {
                    setPage(0);
                    setCategory((prev) => toggleValue(prev, opt.key));
                  }}
                />
                <span className="min-w-0 flex-1 truncate">{opt.key}</span>
                {opt.count != null && (
                  <span className="font-mono text-[10px] text-muted-foreground">{opt.count}</span>
                )}
              </label>
            ))}
            {!categoryOptions.length && (
              <p className="px-2 py-3 text-[11px] text-muted-foreground">
                Categories appear from results
              </p>
            )}
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
          {error && (
            <div className="shrink-0 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
              {error}
            </div>
          )}
          <Input
            className="max-w-sm shrink-0"
            placeholder="Filter user, module, event, IP…"
            value={q}
            onChange={(e) => {
              setPage(0);
              setQ(e.target.value);
            }}
          />
          <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-[1fr_300px]">
            <Card className="flex min-h-0 flex-col overflow-hidden">
              <div className="min-h-0 flex-1 overflow-auto scroll-thin">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="sticky top-0 z-10 border-b bg-muted/90 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
                    <tr>
                      <th className="px-3 py-2 text-left">When</th>
                      <th className="px-3 py-2 text-left">User</th>
                      <th className="px-3 py-2 text-left">IP</th>
                      <th className="px-3 py-2 text-left">Module</th>
                      <th className="px-3 py-2 text-left">Event</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-xs text-muted-foreground">
                          {loading ? "Loading…" : "No audit events from Elasticsearch"}
                        </td>
                      </tr>
                    )}
                    {items.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => setSelected(r)}
                        className={cn(
                          "cursor-pointer border-b border-border/50 hover:bg-primary/5",
                          selected?.id === r.id && "bg-primary/10"
                        )}
                      >
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">
                          {r.ts ? relativeTime(r.ts) : ""}
                        </td>
                        <td className="px-3 py-2.5 text-xs font-medium">{r.username}</td>
                        <td className="px-3 py-2.5 font-mono text-[11px]">{r.clientIp}</td>
                        <td className="px-3 py-2.5 text-xs">{r.module || r.category}</td>
                        <td className="px-3 py-2.5 text-xs">
                          <div className="font-medium">{r.event}</div>
                          <div className="text-muted-foreground">{r.message}</div>
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

            <Card className="min-h-0 overflow-hidden">
              {!selected ? (
                <div className="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
                  Select an audit event for details
                </div>
              ) : (
                <div className="flex h-full flex-col">
                  <div className="flex items-start justify-between gap-2 border-b border-border/50 p-3">
                    <div>
                      <p className="text-sm font-semibold">{selected.event || "Event"}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {selected.ts ? new Date(selected.ts).toLocaleString() : "—"}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3 scroll-thin">
                    {(
                      [
                        ["User", selected.username],
                        ["Client IP", selected.clientIp],
                        ["Category", selected.category],
                        ["Module", selected.module],
                        ["Event", selected.event],
                        ["Message", selected.message],
                        ["Document id", selected.id],
                      ] as [string, unknown][]
                    ).map(([label, value]) =>
                      value != null && String(value).trim() !== "" ? (
                        <div key={label} className="ndr-inset p-2">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {label}
                          </div>
                          <div className="mt-0.5 break-words text-xs font-medium">{String(value)}</div>
                        </div>
                      ) : null
                    )}
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </PageFrame>
  );
}
