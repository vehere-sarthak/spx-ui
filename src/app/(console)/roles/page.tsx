"use client";

import { apiFetch } from "@/lib/api-client";
import * as React from "react";
import { PageFrame } from "@/components/ndr/page-frame";
import { PaginationBar } from "@/components/ndr/pagination-bar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  APP_PERMISSION_TREE,
  PermNode,
  flattenPermissionIds,
  parsePermissions,
  serializePermissions,
} from "@/lib/permissions";
import { readSessionUser } from "@/lib/session";
import { cn } from "@/lib/utils";

const LANDING_OPTIONS = [
  { id: "command", label: "Command Center" },
  { id: "mcsConfiguration", label: "CMS SOI Dashboard" },
  { id: "alerts", label: "Alerts" },
  { id: "linkMonitoring", label: "Link Monitoring" },
  { id: "targetManagementSystem", label: "Targets" },
  { id: "linkIdentifier", label: "Capture Input" },
  { id: "spiderxEdge", label: "Spider-X Edge" },
  { id: "healthMonitorings", label: "Health" },
  { id: "userManagement", label: "Users" },
  { id: "roleManagement", label: "Roles" },
  { id: "auditTrail", label: "Audit Trail" },
  { id: "aboutConfiguration", label: "About" },
];

type RoleForm = {
  id?: number;
  role_name: string;
  landingPage: string;
  permissions: string[];
};

function collectDescendantIds(node: PermNode): string[] {
  const out = [node.id];
  for (const c of node.children || []) out.push(...collectDescendantIds(c));
  return out;
}

function PermTreeNode({
  node,
  selected,
  onToggle,
  depth = 0,
}: {
  node: PermNode;
  selected: Set<string>;
  onToggle: (ids: string[], checked: boolean) => void;
  depth?: number;
}) {
  const ids = collectDescendantIds(node);
  const checked = ids.every((id) => selected.has(id));
  const partial = !checked && ids.some((id) => selected.has(id));

  return (
    <div>
      <label
        className={cn("flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted/50")}
        style={{ paddingLeft: depth * 14 + 4 }}
      >
        <input
          type="checkbox"
          checked={checked}
          ref={(el) => {
            if (el) el.indeterminate = partial;
          }}
          onChange={(e) => onToggle(ids, e.target.checked)}
        />
        <span className="text-sm">{node.label}</span>
        <span className="font-mono text-[10px] text-muted-foreground">{node.id}</span>
      </label>
      {(node.children || []).map((c) => (
        <PermTreeNode key={c.id} node={c} selected={selected} onToggle={onToggle} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function RolesPage() {
  const [items, setItems] = React.useState<any[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(20);
  const [q, setQ] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"create" | "edit">("create");
  const [form, setForm] = React.useState<RoleForm>({
    role_name: "",
    landingPage: "command",
    permissions: flattenPermissionIds(),
  });
  const [saving, setSaving] = React.useState(false);

  const selected = React.useMemo(() => new Set(form.permissions), [form.permissions]);

  const load = React.useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), query: q });
      const res = await apiFetch(`/roles?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setItems(json.items || []);
      setTotal(json.total || 0);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }, [page, pageSize, q]);

  React.useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  function openCreate() {
    setMode("create");
    setForm({
      role_name: "",
      landingPage: "command",
      permissions: flattenPermissionIds(),
    });
    setOpen(true);
  }

  function openEdit(r: any) {
    setMode("edit");
    setForm({
      id: r.id,
      role_name: r.role_name || "",
      landingPage: r.landingPage || "command",
      permissions: parsePermissions(r.permissions),
    });
    setOpen(true);
  }

  function onToggle(ids: string[], checked: boolean) {
    setForm((f) => {
      const set = new Set(f.permissions);
      if (checked) ids.forEach((id) => set.add(id));
      else ids.forEach((id) => set.delete(id));
      return { ...f, permissions: Array.from(set) };
    });
  }

  async function save() {
    if (!form.role_name.trim() || !form.permissions.length) {
      setError("role_name and permissions required");
      return;
    }
    const actor = readSessionUser()?.user_id || "spiderx";
    const payload = {
      role_name: form.role_name.trim(),
      landingPage: form.landingPage,
      permissions: serializePermissions(form.permissions),
    };
    setSaving(true);
    try {
      if (mode === "create") {
        const res = await apiFetch("/roles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: { ...payload, created_by: actor } }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || "Create failed");
          return;
        }
      } else {
        const res = await apiFetch("/roles", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            _id: form.id,
            data: { ...payload, last_modified_by: actor },
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || "Update failed");
          return;
        }
      }
      setOpen(false);
      setError(null);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    const res = await apiFetch("/roles", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
    if (!res.ok) setError((await res.json()).error || "Delete failed");
    else load();
  }

  return (
    <PageFrame
      title="Role Management"
      meta={`${total} roles`}
      actions={
        <Button size="sm" onClick={openCreate}>
          Create role
        </Button>
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
          placeholder="Search roles…"
          value={q}
          onChange={(e) => {
            setPage(0);
            setQ(e.target.value);
          }}
        />
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-auto scroll-thin">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="sticky top-0 border-b bg-muted/90 text-[11px] uppercase text-muted-foreground backdrop-blur">
                <tr>
                  <th className="px-3 py-2 text-left">Role</th>
                  <th className="px-3 py-2 text-left">Users</th>
                  <th className="px-3 py-2 text-left">Landing</th>
                  <th className="px-3 py-2 text-left">Permissions</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-primary/5">
                    <td className="px-3 py-2.5 font-medium">{r.role_name}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{r.user_count}</td>
                    <td className="px-3 py-2.5 text-xs">{r.landingPage}</td>
                    <td className="px-3 py-2.5 text-[10px] text-muted-foreground">
                      {String(r.permissions || "").slice(0, 80)}
                      {String(r.permissions || "").length > 80 ? "…" : ""}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(r.id)}>
                          Delete
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
            total={total}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPage(0);
              setPageSize(s);
            }}
          />
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <div className="space-y-3">
            <h3 className="font-semibold">{mode === "create" ? "Create role" : "Edit role"}</h3>
            <div className="space-y-1">
              <Label>Role name</Label>
              <Input
                value={form.role_name}
                onChange={(e) => setForm((f) => ({ ...f, role_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Landing page</Label>
              <Select
                value={form.landingPage}
                onValueChange={(v) => setForm((f) => ({ ...f, landingPage: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Landing page" />
                </SelectTrigger>
                <SelectContent>
                  {LANDING_OPTIONS.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label>Permissions</Label>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setForm((f) => ({ ...f, permissions: flattenPermissionIds() }))
                    }
                  >
                    All
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setForm((f) => ({ ...f, permissions: [] }))}
                  >
                    None
                  </Button>
                </div>
              </div>
              <div className="max-h-64 overflow-auto rounded-md border border-border/60 p-2 scroll-thin">
                {APP_PERMISSION_TREE.map((n) => (
                  <PermTreeNode key={n.id} node={n} selected={selected} onToggle={onToggle} />
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                {form.permissions.length} permission keys selected
              </p>
            </div>
            <Button className="w-full" disabled={saving} onClick={save}>
              {saving ? "Saving…" : mode === "create" ? "Create" : "Save changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageFrame>
  );
}
