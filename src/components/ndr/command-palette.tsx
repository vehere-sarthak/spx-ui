"use client";

import { apiFetch } from "@/lib/api-client";
import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  HeartPulse,
  LayoutDashboard,
  ScrollText,
  ServerCog,
  ShieldAlert,
  Waypoints,
  FolderKanban,
  Cable,
  Users,
  Shield,
  Info,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { Detection } from "@/lib/types";
import { cn } from "@/lib/utils";
import { canAccessModule, useSessionUser } from "@/lib/session";

const ROUTES = [
  { href: "/command", label: "Command Center", icon: LayoutDashboard, hint: "SOC overview", module: "command" },
  { href: "/alerts", label: "Detections", icon: ShieldAlert, hint: "Alert grid", module: "alerts" },
  { href: "/links", label: "Link Fabric", icon: Waypoints, hint: "Link monitoring", module: "linkMonitoring" },
  { href: "/targets", label: "Targets", icon: FolderKanban, hint: "Target management", module: "targetManagementSystem" },
  { href: "/capture-input", label: "Capture Input", icon: Cable, hint: "Capture identification", module: "linkIdentifier" },
  { href: "/edge", label: "Spider-X Edge", icon: ServerCog, hint: "Appliances & probes", module: "spiderxEdge" },
  { href: "/health", label: "Health", icon: HeartPulse, hint: "Host & ES health", module: "healthMonitorings" },
  { href: "/users", label: "Users", icon: Users, hint: "User management", module: "userManagement" },
  { href: "/roles", label: "Roles", icon: Shield, hint: "Role permissions", module: "roleManagement" },
  { href: "/audit", label: "Audit Trail", icon: ScrollText, hint: "Operator actions", module: "auditTrail" },
  { href: "/about", label: "About", icon: Info, hint: "Product & environment", module: "aboutConfiguration" },
];

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [active, setActive] = React.useState(0);
  const [detectionHits, setDetectionHits] = React.useState<Detection[]>([]);
  const router = useRouter();
  const pathname = usePathname();
  const user = useSessionUser();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (!open) {
      setQ("");
      setActive(0);
      setDetectionHits([]);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open || q.trim().length < 2) {
      setDetectionHits([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ pageSize: "5", startTime: "now-7d", query: q.trim() });
        const res = await apiFetch(`/alerts?${params}`, { cache: "no-store" });
        const json = await res.json();
        if (res.ok) setDetectionHits(json.items || []);
      } catch {
        setDetectionHits([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, open]);

  const routeHits = ROUTES.filter((r) => {
    if (!canAccessModule(user?.permissions, r.module)) return false;
    const s = q.toLowerCase();
    if (!s) return true;
    return r.label.toLowerCase().includes(s) || r.hint.toLowerCase().includes(s);
  });

  const flat = [
    ...routeHits.map((r) => ({ type: "route" as const, ...r })),
    ...detectionHits.map((d) => ({
      type: "detection" as const,
      href: `/alerts`,
      label: d.title,
      icon: Activity,
      hint: `${d.id} · ${d.src}`,
      severity: d.severity,
    })),
  ];

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && flat[active]) {
      go(flat[active].href);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-xl [&>button]:hidden" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-2 border-b px-3">
          <Activity className="h-4 w-4 text-primary" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            placeholder="Jump to SpiderX page or search alerts…"
            className="h-12 border-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-2 scroll-thin">
          {flat.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matches</p>
          )}
          {flat.map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={`${item.type}-${item.href}-${item.label}-${i}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(item.href)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                  i === active ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted"
                )}
              >
                <Icon className={cn("h-4 w-4", i === active && "text-primary")} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-foreground">{item.label}</div>
                  <div className="truncate text-[11px] opacity-70">{item.hint}</div>
                </div>
                {"severity" in item && item.severity ? <Badge variant={item.severity}>{item.severity}</Badge> : null}
                {item.type === "route" && pathname.startsWith(item.href) && <Badge variant="secondary">here</Badge>}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { ROUTES };
