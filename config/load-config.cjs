/**
 * Shared SpiderX config loader (CJS) — used by server.js and mirrored in app-config.ts.
 * Merge order: bundled config/spiderx.yml → /etc/spiderx/spiderx.yml → env overrides.
 */
const fs = require("fs");
const path = require("path");

function stripHashComments(text) {
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("#")) return "";
      // keep # inside strings roughly: only strip unquoted trailing comments
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

/** Parse vehere-style object-literal YAML (not full YAML). */
function parseConfigText(text) {
  let cleaned = stripHashComments(String(text || "")).trim();
  if (!cleaned) return {};
  // Insert commas between top-level `} key:` blocks (vehere yml omits them)
  cleaned = cleaned.replace(/}\s*\n+(\w+\s*:)/g, "},\n$1");
  if (cleaned.startsWith("{")) {
    return Function(`"use strict"; return (${cleaned});`)();
  }
  return Function(`"use strict"; return ({${cleaned}});`)();
}

function deepMerge(base, overlay) {
  if (!overlay || typeof overlay !== "object") return base;
  const out = Array.isArray(base) ? [...base] : { ...(base || {}) };
  for (const [k, v] of Object.entries(overlay)) {
    if (v && typeof v === "object" && !Array.isArray(v) && typeof out[k] === "object" && out[k] && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

function readYml(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return parseConfigText(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    console.warn(`[spiderx-config] failed to parse ${filePath}:`, e.message);
    return null;
  }
}

function applyEnvOverrides(cfg) {
  const c = deepMerge({}, cfg);
  c.elasticsearch_config = c.elasticsearch_config || {};
  c.mySQL_config = c.mySQL_config || {};
  c.auth = c.auth || {};
  c.server = c.server || {};
  c.filePath = c.filePath || {};
  c.uiservice = c.uiservice || {};

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
  if (process.env.APP_TOTP_ISSUER) c.auth.APP_TOTP_ISSUER = process.env.APP_TOTP_ISSUER;
  if (process.env.PORT) c.server.port = Number(process.env.PORT);
  if (process.env.UISERVICE_URL) c.uiservice.url = process.env.UISERVICE_URL;

  if (process.env.SPIDERX_SSL_CERT) c.filePath.server_ssl_certificate = process.env.SPIDERX_SSL_CERT;
  if (process.env.SPIDERX_SSL_KEY) c.filePath.server_ssl_key = process.env.SPIDERX_SSL_KEY;

  return c;
}

function applySetupInfo(cfg) {
  const setupPath =
    (cfg.filePath && cfg.filePath.setupInfoFilePath) || "/usr/local/etc/setup_info.json";
  try {
    if (!fs.existsSync(setupPath)) return cfg;
    const setup = JSON.parse(fs.readFileSync(setupPath, "utf8"));
    const masters = Array.isArray(setup?.database?.master) ? setup.database.master.filter(Boolean) : [];
    if (masters.length === 1) {
      cfg.elasticsearch_config = cfg.elasticsearch_config || {};
      cfg.elasticsearch_config.hosts = `https://${masters[0]}:9200/`;
    } else if (masters.length > 1) {
      cfg.elasticsearch_config = cfg.elasticsearch_config || {};
      cfg.elasticsearch_config.hosts = masters.map((ip) => `https://${ip}:9200/`);
    }
    const appIp = setup?.app?.ip?.[0] || setup?.local?.ip?.[0];
    if (appIp && (!cfg.mySQL_config?.host || cfg.mySQL_config.host === "localhost")) {
      cfg.mySQL_config = cfg.mySQL_config || {};
      cfg.mySQL_config.host = appIp;
    }
    // Azure MFA gate from platform setup (same as vehere-ui setupConfig.app.mfa)
    if (setup?.app?.mfa) {
      cfg.auth = cfg.auth || {};
      cfg.auth.platform_mfa = setup.app.mfa;
    }
  } catch (e) {
    console.warn("[spiderx-config] setup_info.json:", e.message);
  }
  return cfg;
}

function resolveBundledPath() {
  const candidates = [
    // deb layout: spiderx.yml sits next to this loader
    path.join(__dirname, "spiderx.yml"),
    path.join(process.cwd(), "config", "spiderx.yml"),
    path.join(process.cwd(), "spiderx.yml"),
    "/usr/local/lib/spiderx/config/spiderx.yml",
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

function resolveExternalPath(cfg) {
  const folder = cfg?.filePath?.externalConfigFolderPath || "/etc/spiderx";
  const name = cfg?.filePath?.externalConfigFileName || "spiderx.yml";
  return path.join(folder, name);
}

let _cache = null;

function loadAppConfig(force = false) {
  if (_cache && !force) return _cache;
  const bundledPath = resolveBundledPath();
  let cfg = readYml(bundledPath) || {};
  const external = resolveExternalPath(cfg);
  const overlay = readYml(external);
  if (overlay) cfg = deepMerge(cfg, overlay);
  cfg = applySetupInfo(cfg);
  cfg = applyEnvOverrides(cfg);
  _cache = cfg;
  return cfg;
}

function esHostsList(cfg) {
  const h = cfg?.elasticsearch_config?.hosts;
  if (Array.isArray(h)) return h.map((x) => String(x).replace(/\/$/, ""));
  if (typeof h === "string") return [h.replace(/\/$/, "")];
  return ["https://localhost:9200"];
}

function sslOptions(cfg) {
  const cert = cfg?.filePath?.server_ssl_certificate;
  const key = cfg?.filePath?.server_ssl_key;
  if (!cert || !key) return null;
  if (!fs.existsSync(cert) || !fs.existsSync(key)) return null;
  return {
    cert: fs.readFileSync(cert),
    key: fs.readFileSync(key),
  };
}

module.exports = {
  loadAppConfig,
  esHostsList,
  sslOptions,
  parseConfigText,
  deepMerge,
};
