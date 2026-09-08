"use client";

import * as React from "react";

export type SpiderUser = {
  id?: number;
  user_id?: string;
  user_name?: string;
  role_id?: number;
  role_name?: string;
  permissions?: string[];
  landingPage?: string;
  email_id?: string;
};

export function readSessionUser(): SpiderUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("spiderx_user");
    if (!raw) return null;
    return JSON.parse(raw) as SpiderUser;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem("spiderx_session");
  localStorage.removeItem("spiderx_user");
  if (typeof window !== "undefined") {
    void fetch("/api/v1/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "logout" }),
    }).catch(() => null);
  }
}

/** Map SpiderX nav modules → vehere-ui permission keys (and aliases). */
const MODULE_ALIASES: Record<string, string[]> = {
  command: ["command", "dashboard", "mcsConfiguration"],
  alerts: ["alerts"],
  linkMonitoring: ["linkMonitoring", "linkanalysis"],
  targetManagementSystem: ["targetManagementSystem", "entityOfInterest", "captureFilters"],
  linkIdentifier: ["linkIdentifier", "captureFilters"],
  spiderxEdge: ["spiderxEdge", "dataGrid"],
  healthMonitorings: ["healthMonitorings"],
  userManagement: ["userManagement"],
  roleManagement: ["roleManagement"],
  auditTrail: ["auditTrail"],
  aboutConfiguration: ["aboutConfiguration"],
};

export function canAccessModule(permissions: string[] | undefined, module?: string) {
  if (!module) return true;
  if (!permissions || permissions.length === 0) return true; // open until logged in shapes settle
  const aliases = MODULE_ALIASES[module] || [module];
  return aliases.some((a) => permissions.includes(a));
}

/**
 * Map vehere-ui role landingPage / module ids → SpiderX routes.
 * Roles in MySQL often store e.g. `mcsConfiguration` which 404s if used raw.
 */
const LANDING_MAP: Record<string, string> = {
  command: "/command",
  dashboard: "/command",
  mcsConfiguration: "/command?view=cms",
  cmsDashboard: "/command?view=cms",
  "mcs-configuration": "/command?view=cms",
  alerts: "/alerts",
  alertGrid: "/alerts",
  linkMonitoring: "/links",
  managementSystem: "/targets",
  targetManagementSystem: "/targets",
  linkIdentifier: "/capture-input",
  spiderxEdge: "/edge",
  healthMonitorings: "/health",
  auditTrail: "/audit",
  aboutConfiguration: "/about",
  userManagement: "/users",
  roleManagement: "/roles",
  configuration: "/about",
};

export function resolveLandingHref(landingPage?: string | null): string {
  if (!landingPage) return "/command";
  const raw = String(landingPage).trim().replace(/^\//, "");
  if (!raw) return "/command";
  if (LANDING_MAP[raw]) return LANDING_MAP[raw];
  // already a spiderx path like "command" or "alerts"
  const known = [
    "command",
    "alerts",
    "links",
    "targets",
    "capture-input",
    "edge",
    "health",
    "users",
    "roles",
    "audit",
    "about",
  ];
  if (known.includes(raw)) return `/${raw}`;
  return "/command";
}

export function useSessionUser() {
  const [user, setUser] = React.useState<SpiderUser | null>(null);
  React.useEffect(() => {
    setUser(readSessionUser());
    const onStorage = () => setUser(readSessionUser());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return user;
}
