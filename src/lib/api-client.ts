"use client";

/**
 * All application data comes from spx-service on :8082, never from spx-ui's own
 * origin — the same split vehere-ui has with uiServices, where the axios
 * instance rewrites baseURL to `https://<systemIp>:8082`.
 *
 * spx-ui only serves /api/spiderx-configuration and /api/spiderx-endpoint.
 */

type Endpoint = { servicePort: number; apiPrefix: string };

let endpointPromise: Promise<Endpoint> | null = null;

function loadEndpoint(): Promise<Endpoint> {
  if (!endpointPromise) {
    endpointPromise = fetch("/api/spiderx-endpoint", { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => ({ servicePort: 8082, apiPrefix: "/api/v1" }));
  }
  return endpointPromise;
}

/** Absolute base for spx-service, derived from the address the browser used. */
export async function serviceBase(): Promise<string> {
  const { servicePort, apiPrefix } = await loadEndpoint();
  const host = typeof window !== "undefined" ? window.location.hostname : "127.0.0.1";
  return `https://${host}:${servicePort}${apiPrefix}`;
}

/**
 * `path` is relative to the API prefix: apiFetch("/alerts?page=0").
 * Credentials are included so the session cookie crosses the origin boundary.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = await serviceBase();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  return fetch(url, {
    ...init,
    credentials: "include",
    cache: init?.cache ?? "no-store",
  });
}

/** For links the browser navigates to or downloads (CSV, PCAP). */
export async function apiUrl(path: string): Promise<string> {
  const base = await serviceBase();
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
