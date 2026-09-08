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
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { readSessionUser } from "@/lib/session";

type UserForm = {
  id?: number;
  user_id: string;
  user_name: string;
  email_id: string;
  role_id: string;
  password: string;
  mfa_enabled: boolean;
  totp_enabled: boolean; // enrolled status (read-only in form except reset)
};

const emptyForm = (roleId = ""): UserForm => ({
  user_id: "",
  user_name: "",
  email_id: "",
  role_id: roleId,
  password: "",
  mfa_enabled: false,
  totp_enabled: false,
});

export default function UsersPage() {
  const [items, setItems] = React.useState<any[]>([]);
  const [roles, setRoles] = React.useState<any[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(20);
  const [q, setQ] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"create" | "edit">("create");
  const [form, setForm] = React.useState<UserForm>(emptyForm());
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), query: q });
      const [u, r] = await Promise.all([
        apiFetch(`/users?${params}`, { cache: "no-store" }).then((x) => x.json()),
        apiFetch(`/roles?pageSize=100`, { cache: "no-store" }).then((x) => x.json()),
      ]);
      if (u.error) throw new Error(u.error);
      setItems(u.items || []);
      setTotal(u.total || 0);
      setRoles(r.items || []);
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
    setForm(emptyForm(String(roles[0]?.id || "")));
    setOpen(true);
  }

  function openEdit(u: any) {
    setMode("edit");
    setForm({
      id: u.id,
      user_id: u.user_id || "",
      user_name: u.user_name || "",
      email_id: u.email_id || "",
      role_id: String(u.role_id || ""),
      password: "",
      mfa_enabled: !!Number(u.mfa_enabled),
      totp_enabled: !!Number(u.totp_enabled),
    });
    setOpen(true);
  }

  async function save() {
    const actor = readSessionUser()?.user_id || "spiderx";
    setSaving(true);
    try {
      if (mode === "create") {
        if (!form.user_id.trim() || !form.role_id || !form.password) {
          setError("user_id, role, and password are required");
          return;
        }
        const res = await apiFetch("/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: {
              user_id: form.user_id.trim(),
              user_name: form.user_name.trim() || form.user_id.trim(),
              role_id: Number(form.role_id),
              user_pass: form.password,
              email_id: form.email_id,
              mfa_enabled: form.mfa_enabled ? 1 : 0,
              // Do not set totp_enabled on create — user enrolls via QR on first login when MFA required
              created_by: actor,
            },
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || "Create failed");
          return;
        }
      } else {
        if (!form.id) {
          setError("Missing user id");
          return;
        }
        const res = await apiFetch("/users", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            _id: form.id,
            data: {
              user_id: form.user_id,
              user_name: form.user_name.trim() || form.user_id,
              role_id: Number(form.role_id),
              email_id: form.email_id,
              password: form.password || undefined,
              mfa_enabled: form.mfa_enabled ? 1 : 0,
              last_modified_by: actor,
            },
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
    const res = await apiFetch("/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
    if (!res.ok) setError((await res.json()).error || "Delete failed");
    else load();
  }

  return (
    <PageFrame
      title="User Management"
      subtitle={`MySQL ui_db.users · ${total} users`}
      actions={
        <Button size="sm" onClick={openCreate}>
          Create user
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
          placeholder="Search users…"
          value={q}
          onChange={(e) => {
            setPage(0);
            setQ(e.target.value);
          }}
        />
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-auto scroll-thin">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="sticky top-0 border-b bg-muted/90 text-[11px] uppercase text-muted-foreground backdrop-blur">
                <tr>
                  <th className="px-3 py-2 text-left">User</th>
                  <th className="px-3 py-2 text-left">Role</th>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">MFA</th>
                  <th className="px-3 py-2 text-left">Created by</th>
                  <th className="px-3 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((u) => (
                  <tr key={u.id} className="border-b border-border/50 hover:bg-primary/5">
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{u.user_id}</div>
                      <div className="text-[10px] text-muted-foreground">{u.user_name}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant="secondary">{u.role_name}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-xs">{u.email_id || "—"}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {!!Number(u.mfa_enabled) && <Badge variant="outline">MFA</Badge>}
                        {!!Number(u.totp_enabled) && <Badge variant="outline">TOTP</Badge>}
                        {!Number(u.mfa_enabled) && !Number(u.totp_enabled) && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs">{u.created_by}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(u)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(u.id)}>
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
        <DialogContent className="sm:max-w-md">
          <div className="space-y-3">
            <h3 className="font-semibold">{mode === "create" ? "Create user" : "Edit user"}</h3>
            <div className="space-y-1">
              <Label>User ID</Label>
              <Input
                value={form.user_id}
                disabled={mode === "edit"}
                onChange={(e) => setForm((f) => ({ ...f, user_id: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Display name</Label>
              <Input
                value={form.user_name}
                onChange={(e) => setForm((f) => ({ ...f, user_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                value={form.email_id}
                onChange={(e) => setForm((f) => ({ ...f, email_id: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <Select value={form.role_id} onValueChange={(v) => setForm((f) => ({ ...f, role_id: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {r.role_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{mode === "edit" ? "Password (optional)" : "Password"}</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder={mode === "edit" ? "Leave blank to keep" : undefined}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
              <div>
                <Label htmlFor="mfa">Require MFA</Label>
                <p className="text-[11px] text-muted-foreground">
                  Forces authenticator enrollment on next login
                </p>
              </div>
              <Switch
                id="mfa"
                checked={form.mfa_enabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, mfa_enabled: v }))}
              />
            </div>
            {mode === "edit" && (
              <div className="rounded-md border border-border/60 px-3 py-2 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>TOTP enrolled</Label>
                    <p className="text-[11px] text-muted-foreground">
                      {form.totp_enabled
                        ? "Authenticator is active for this user"
                        : "Not enrolled yet"}
                    </p>
                  </div>
                  <Badge variant="outline">{form.totp_enabled ? "Yes" : "No"}</Badge>
                </div>
                {form.totp_enabled && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={saving}
                    onClick={async () => {
                      if (!form.id) return;
                      setSaving(true);
                      try {
                        const res = await apiFetch("/users", {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            _id: form.id,
                            data: {
                              user_id: form.user_id,
                              user_name: form.user_name,
                              role_id: Number(form.role_id),
                              email_id: form.email_id,
                              mfa_enabled: form.mfa_enabled ? 1 : 0,
                              reset_totp: true,
                              last_modified_by: readSessionUser()?.user_id || "spiderx",
                            },
                          }),
                        });
                        const json = await res.json();
                        if (!res.ok) {
                          setError(json.error || "Reset failed");
                          return;
                        }
                        setForm((f) => ({ ...f, totp_enabled: false }));
                        load();
                      } finally {
                        setSaving(false);
                      }
                    }}
                  >
                    Reset TOTP (clear secret)
                  </Button>
                )}
              </div>
            )}
            <Button className="w-full" disabled={saving} onClick={save}>
              {saving ? "Saving…" : mode === "create" ? "Create" : "Save changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageFrame>
  );
}
