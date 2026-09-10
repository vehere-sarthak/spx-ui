import fs from "fs";
import path from "path";

export type SpiderXConfig = {
  elasticsearch_config: {
    hosts: string | string[];
    username: string;
    password: string;
    requestTimeout?: number;
    rejectUnauthorized?: boolean;
  };
  mySQL_config: {
    host: string;
    user: string;
    password: string;
    database: string;
    port: number;
    connectionLimit?: number;
  };
  server: { port: number; bind?: string; preferHttps?: boolean };
  auth: {
    APP_TOTP_ISSUER?: string;
    session_jwt_secret?: string;
    /** Signs half-authenticated challenge cookies only, never a full session. */
    auth_jwt_secret?: string;
    session_cookie_expiresIn_sec?: number;
    session_cookie_key_name?: string;
    platform_mfa?: unknown;
  };
  service?: {
    port?: number;
    bind?: string;
    preferHttps?: boolean;
    apiPrefix?: string;
    url?: string;
  };
  filePath: {
    externalConfigFolderPath?: string;
    externalConfigFileName?: string;
    setupInfoFilePath?: string;
    server_ssl_certificate?: string;
    server_ssl_key?: string;
    license_file_path?: string;
    build_global_meta_data_file_path?: string;
  };
  dbIndex?: Record<string, string>;
};

function stripHashComments(text: string) {
  return text
    .split("\n")
    .map((line) => {
      let inSingle = false;
      let inDouble = false;
      let out = "";
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === "'" && !inDouble) inSingle = !inSingle;
        else if (c === '"' && !inSingle) inDouble = !inDouble;
        else if (c === "#" && !inSingle && !inDouble) break;
        out += c;
      }
      return out;
    })
    .join("\n");
}

function parseConfigText(text: string): Record<string, unknown> {
  let cleaned = stripHashComments(String(text || "")).trim();
  if (!cleaned) return {};
  cleaned = cleaned.replace(/}\s*\n+(\w+\s*:)/g, "},\n$1");
  if (cleaned.startsWith("{")) {
    return Function(`"use strict"; return (${cleaned});`)() as Record<string, unknown>;
  }
  return Function(`"use strict"; return ({${cleaned}});`)() as Record<string, unknown>;
}

function deepMerge<T extends Record<string, any>>(base: T, overlay: Record<string, any> | null | undefined): T {
  if (!overlay) return base;
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base || {}) };
  for (const [k, v] of Object.entries(overlay)) {
    if (v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object" && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

function readYml(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return parseConfigText(fs.readFileSync(filePath, "utf8"));
  } catch (e: any) {
    console.warn(`[spiderx-config] failed to parse ${filePath}:`, e?.message);
    return null;
  }
}

function applyEnvOverrides(cfg: SpiderXConfig): SpiderXConfig {
  const c = deepMerge({} as SpiderXConfig, cfg);
  c.elasticsearch_config = c.elasticsearch_config || ({} as any);
  c.mySQL_config = c.mySQL_config || ({} as any);
  c.auth = c.auth || {};
  c.server = c.server || { port: 3010 };
  c.filePath = c.filePath || {};
  c.service = c.service || {};

  if (process.env.ES_HOST) c.elasticsearch_config.hosts = process.env.ES_HOST;
  if (process.env.ES_USERNAME) c.elasticsearch_config.username = process.env.ES_USERNAME;
  if (process.env.ES_PASSWORD) c.elasticsearch_config.password = process.env.ES_PASSWORD;
  if (process.env.ES_REJECT_UNAUTHORIZED != null) {
    c.elasticsearch_config.rejectUnauthorized = String(process.env.ES_REJECT_UNAUTHORIZED) !== "false";
  }
  if (process.env.MYSQL_HOST) c.mySQL_config.host = process.env.MYSQL_HOST;
  if (process.env.MYSQL_PORT) c.mySQL_config.port = Number(process.env.MYSQL_PORT);
  if (process.env.MYSQL_USER) c.mySQL_config.user = process.env.MYSQL_USER;
  if (process.env.MYSQL_PASSWORD) c.mySQL_config.password = process.env.MYSQL_PASSWORD;
  if (process.env.MYSQL_DATABASE) c.mySQL_config.database = process.env.MYSQL_DATABASE;
  if (process.env.SPIDERX_SESSION_SECRET) c.auth.session_jwt_secret = process.env.SPIDERX_SESSION_SECRET;
  if (process.env.SPIDERX_AUTH_SECRET) c.auth.auth_jwt_secret = process.env.SPIDERX_AUTH_SECRET;
  if (process.env.APP_TOTP_ISSUER) c.auth.APP_TOTP_ISSUER = process.env.APP_TOTP_ISSUER;
  if (process.env.PORT) c.server.port = Number(process.env.PORT);
  if (process.env.SPX_SERVICE_URL) c.service!.url = process.env.SPX_SERVICE_URL;
  if (process.env.SPIDERX_SSL_CERT) c.filePath.server_ssl_certificate = process.env.SPIDERX_SSL_CERT;
  if (process.env.SPIDERX_SSL_KEY) c.filePath.server_ssl_key = process.env.SPIDERX_SSL_KEY;
  return c;
}

function applySetupInfo(cfg: SpiderXConfig): SpiderXConfig {
  const setupPath = cfg.filePath?.setupInfoFilePath || "/usr/local/etc/setup_info.json";
  try {
    if (!fs.existsSync(setupPath)) return cfg;
    const setup = JSON.parse(fs.readFileSync(setupPath, "utf8"));
    const masters = Array.isArray(setup?.database?.master) ? setup.database.master.filter(Boolean) : [];
    if (masters.length === 1) {
      cfg.elasticsearch_config.hosts = `https://${masters[0]}:9200/`;
    } else if (masters.length > 1) {
      cfg.elasticsearch_config.hosts = masters.map((ip: string) => `https://${ip}:9200/`);
    }
    const appIp = setup?.app?.ip?.[0] || setup?.local?.ip?.[0];
    if (appIp && (!cfg.mySQL_config?.host || cfg.mySQL_config.host === "localhost")) {
      cfg.mySQL_config.host = appIp;
    }
    if (setup?.app?.mfa) {
      cfg.auth = cfg.auth || {};
      cfg.auth.platform_mfa = setup.app.mfa;
    }
  } catch (e: any) {
    console.warn("[spiderx-config] setup_info.json:", e?.message);
  }
  return cfg;
}

function bundledPath() {
  const candidates = [
    path.join(process.cwd(), "config", "spiderx.yml"),
    path.join(process.cwd(), "spiderx.yml"),
    "/usr/local/lib/spiderx/config/spiderx.yml",
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return candidates[0];
}

/**
 * Development-only overlay, mirroring vehere-ui's uiconfig.dev.yml. Git-ignored
 * and never packaged; supplies real credentials on a developer box while the
 * bundled spiderx.yml keeps placeholders.
 */
function devPath(): string | null {
  const candidates = [
    path.join(process.cwd(), "config", "spiderx.dev.yml"),
    path.join(process.cwd(), "spiderx.dev.yml"),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return null;
}

function externalPath(cfg: Partial<SpiderXConfig>) {
  const folder = cfg.filePath?.externalConfigFolderPath || "/etc/spiderx";
  const name = cfg.filePath?.externalConfigFileName || "spiderx.yml";
  return path.join(folder, name);
}

let _cache: SpiderXConfig | null = null;

export function getAppConfig(force = false): SpiderXConfig {
  if (_cache && !force) return _cache;
  let cfg = (readYml(bundledPath()) || {}) as SpiderXConfig;
  // Dev overlay sits between the bundled defaults and the appliance overlay, so
  // an appliance file still wins on a real deployment.
  if (process.env.NEXT_PUBLIC_ENV === "development") {
    const dp = devPath();
    const devCfg = dp ? readYml(dp) : null;
    if (devCfg) cfg = deepMerge(cfg, devCfg as SpiderXConfig);
  }
  const overlay = readYml(externalPath(cfg));
  if (overlay) cfg = deepMerge(cfg, overlay);
  cfg = applySetupInfo(cfg);
  cfg = applyEnvOverrides(cfg);
  _cache = cfg;
  return cfg;
}

export function getEsPrimaryHost(): string {
  const h = getAppConfig().elasticsearch_config?.hosts;
  if (Array.isArray(h)) return String(h[0] || "https://localhost:9200").replace(/\/$/, "");
  return String(h || "https://localhost:9200").replace(/\/$/, "");
}

export function getEsAuth() {
  const es = getAppConfig().elasticsearch_config || ({} as SpiderXConfig["elasticsearch_config"]);
  return {
    username: es.username || "admin",
    password: es.password || "",
    rejectUnauthorized: es.rejectUnauthorized === true,
  };
}

export function getMysqlConfig() {
  const m = getAppConfig().mySQL_config;
  return {
    host: m?.host || "localhost",
    port: Number(m?.port || 3306),
    user: m?.user || "vehere",
    password: m?.password || "",
    database: m?.database || "ui_db",
    connectionLimit: Number(m?.connectionLimit || 10),
  };
}

export function getTotpIssuer(): string {
  return getAppConfig().auth?.APP_TOTP_ISSUER || "SpiderX";
}

export function getSessionSecret(): string {
  return (
    process.env.SPIDERX_SESSION_SECRET ||
    getAppConfig().auth?.session_jwt_secret ||
    "change-me-in-production"
  );
}

/** Half-auth challenge cookies are signed with their own key, as uiServices does. */
export function getAuthSecret(): string {
  return (
    process.env.SPIDERX_AUTH_SECRET ||
    getAppConfig().auth?.auth_jwt_secret ||
    getSessionSecret()
  );
}

export function getSessionMaxAgeSec(): number {
  return Number(getAppConfig().auth?.session_cookie_expiresIn_sec || 43200);
}

export function sslEnabled(): boolean {
  const fp = getAppConfig().filePath || {};
  const cert = fp.server_ssl_certificate || "/usr/local/share/ca-certificates/VEHERE.crt";
  const key = fp.server_ssl_key || "/usr/local/share/ca-certificates/VEHERE.key";
  try {
    return fs.existsSync(cert) && fs.existsSync(key);
  } catch {
    return false;
  }
}

export function getSslPaths() {
  const fp = getAppConfig().filePath || {};
  return {
    cert: fp.server_ssl_certificate || "/usr/local/share/ca-certificates/VEHERE.crt",
    key: fp.server_ssl_key || "/usr/local/share/ca-certificates/VEHERE.key",
  };
}
