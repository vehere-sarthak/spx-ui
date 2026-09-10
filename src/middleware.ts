import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side route gate.
 *
 * Without this, every console route was a client component that rendered its
 * shell first and only redirected from a `useEffect` — so an unauthenticated
 * deep link painted the dashboard before bouncing to /login. Deciding here means
 * the browser never receives that HTML in the first place.
 *
 * This runs in the edge runtime, which has no `fs`, so it cannot read
 * spiderx.yml for the signing secret and therefore cannot verify the cookie's
 * HMAC. It reads the payload and its expiry only. That is deliberate and
 * sufficient: this gate decides *which page to show*, while spx-service's
 * `requireSession` verifies the signature on every API call and is what actually
 * protects data. A forged cookie gets you an empty dashboard whose every request
 * 401s — not access. vehere-ui's middleware draws the same line (`jwt.decode`,
 * never `jwt.verify`).
 */

const SESSION_COOKIE = process.env.SPIDERX_SESSION_COOKIE_NAME || "spiderx_sid";

type SessionPayload = {
  user_id?: string;
  role_name?: string;
  permissions?: string[];
  landingPage?: string;
  purpose?: string;
  exp?: number;
};

/** base64url → JSON, with no Node built-ins. Returns null on anything unexpected. */
function decodePayload(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const body = token.split(".")[0];
  if (!body) return null;
  try {
    const base64 = body.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded);
    const payload = JSON.parse(json) as SessionPayload;
    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    // A mid-login challenge token rides in its own cookie, but reject it here
    // too so a copied value can never stand in for a finished session.
    if (payload.purpose) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Route → permission module, mirroring ROUTES in components/ndr/command-palette. */
const ROUTE_MODULES: Array<[string, string]> = [
  ["/command", "command"],
  ["/alerts", "alerts"],
  ["/links", "linkMonitoring"],
  ["/targets", "targetManagementSystem"],
  ["/capture-input", "linkIdentifier"],
  ["/edge", "spiderxEdge"],
  ["/health", "healthMonitorings"],
  ["/users", "userManagement"],
  ["/roles", "roleManagement"],
  ["/audit", "auditTrail"],
  ["/about", "aboutConfiguration"],
];

/** Aliases kept in step with MODULE_ALIASES in lib/session. */
const MODULE_ALIASES: Record<string, string[]> = {
  command: ["command", "dashboard", "mcsConfiguration", "cmsDashboard"],
  alerts: ["alerts", "alertGrid"],
  linkMonitoring: ["linkMonitoring", "linkanalysis"],
  targetManagementSystem: ["targetManagementSystem", "managementSystem", "entityOfInterest"],
  linkIdentifier: ["linkIdentifier", "dataManagement", "captureFilters"],
  spiderxEdge: ["spiderxEdge", "dataGrid"],
  healthMonitorings: ["healthMonitorings"],
  userManagement: ["userManagement", "management"],
  roleManagement: ["roleManagement", "management"],
  auditTrail: ["auditTrail"],
  aboutConfiguration: ["aboutConfiguration", "configuration"],
};

const LANDING_MAP: Record<string, string> = {
  command: "/command",
  dashboard: "/command",
  mcsConfiguration: "/command?view=cms",
  cmsDashboard: "/command?view=cms",
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

function landingHref(session: SessionPayload): string {
  const raw = String(session.landingPage || "").trim().replace(/^\//, "");
  if (raw && LANDING_MAP[raw]) return LANDING_MAP[raw];
  if (raw && ROUTE_MODULES.some(([href]) => href === `/${raw}`)) return `/${raw}`;
  // Fall back to the first route the role can actually open, so a user without
  // Command Center access does not land on a page that bounces them again.
  const perms = session.permissions || [];
  if (perms.length) {
    const first = ROUTE_MODULES.find(([, mod]) => hasModule(perms, mod));
    if (first) return first[0];
  }
  return "/command";
}

function hasModule(permissions: string[], moduleId: string): boolean {
  const aliases = MODULE_ALIASES[moduleId] || [moduleId];
  return permissions.some((p) => aliases.includes(p.replace(/_view$/, "")));
}

/** Assets and the handful of endpoints the login page itself needs. */
function isPublicAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/fonts/") ||
    pathname === "/favicon.ico" ||
    // The login page reads this to learn which port spx-service listens on.
    pathname === "/api/spiderx-endpoint" ||
    pathname === "/api/spiderx-configuration"
  );
}

export function middleware(request: NextRequest) {
  const { nextUrl, cookies } = request;
  const pathname = nextUrl.pathname;

  if (isPublicAsset(pathname)) return NextResponse.next();

  const session = decodePayload(cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/login") {
    // Already signed in — skip the form rather than showing it and bouncing.
    if (session) {
      return NextResponse.redirect(new URL(landingHref(session), request.url));
    }
    return NextResponse.next();
  }

  if (!session) {
    const target = new URL("/login", request.url);
    // Preserve the deep link so the user lands where they were headed.
    const wanted = `${pathname}${nextUrl.search}`;
    if (pathname !== "/" && wanted) {
      target.searchParams.set("redirectedUrl", wanted);
    }
    return NextResponse.redirect(target);
  }

  if (pathname === "/") {
    return NextResponse.redirect(new URL(landingHref(session), request.url));
  }

  // Permission gate. An empty permission list is treated as unrestricted, which
  // is what canAccessModule in lib/session already assumes; spx-service is the
  // component that decides what such a role may actually read.
  const entry = ROUTE_MODULES.find(([href]) => pathname === href || pathname.startsWith(`${href}/`));
  if (entry) {
    const permissions = session.permissions || [];
    // Spider-X Edge stays vnfsadmin-only, matching vehere-ui's carve-out.
    const edgeBlocked = entry[0] === "/edge" && session.role_name !== "vnfsadmin";
    if (edgeBlocked || (permissions.length > 0 && !hasModule(permissions, entry[1]))) {
      const dest = landingHref(session);
      // A role whose landing page is itself blocked would ping-pong forever.
      // Let the page render instead and show its own empty state.
      if (new URL(dest, request.url).pathname !== pathname) {
        return NextResponse.redirect(new URL(dest, request.url));
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
