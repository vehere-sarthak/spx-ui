/**
 * Production HTTPS entry (vehere-ui server.js pattern).
 * Cert/key from the shared spiderx/config/spiderx.yml → /etc/spiderx/spiderx.yml → SPIDERX_SSL_*.
 * Falls back to HTTP if certificates are missing.
 */
const { createServer: createHttpsServer } = require("https");
const { createServer: createHttpServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { loadAppConfig, sslOptions } = require("./config/load-config.cjs");

const dev = process.env.NODE_ENV !== "production";

// Next loads .env/.env.local itself, but only once app.prepare() runs — and the
// config chain below is read before that. Without this, NEXT_PUBLIC_ENV is unset
// at boot and the development overlay is skipped silently.
require("@next/env").loadEnvConfig(process.cwd(), dev);

const cfg = loadAppConfig();
const port = parseInt(process.env.PORT || String(cfg.server?.port || 4000), 10);
const hostname = process.env.HOSTNAME || cfg.server?.bind || "0.0.0.0";

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const handler = (req, res) => {
    const parsedUrl = parse(req.url || "", true);
    handle(req, res, parsedUrl);
  };

  const ssl = sslOptions(cfg);
  if (ssl && cfg.server?.preferHttps !== false) {
    createHttpsServer(ssl, handler).listen(port, hostname, (err) => {
      if (err) throw err;
      console.log(`[spx-ui] HTTPS https://${hostname}:${port}`);
      console.log(`[spx-ui] cert ${cfg.filePath?.server_ssl_certificate}`);
    });
    return;
  }

  console.warn("[spx-ui] SSL cert/key missing — starting HTTP (set VEHERE.crt/key or SPIDERX_SSL_*)");
  createHttpServer(handler).listen(port, hostname, (err) => {
    if (err) throw err;
    console.log(`[spx-ui] HTTP http://${hostname}:${port}`);
  });
});
