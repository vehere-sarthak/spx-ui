# spx-ui

SpiderX frontend. Next.js served over HTTPS on **:4000** — the same port and
deployment shape as `vehere-ui`.

This repo is independent of `spx-service`. The two are coupled only at runtime,
over HTTPS, exactly as `vehere-ui` couples to `uiServices`.

## Configuration

**This repo owns the configuration.** `config/spiderx.yml` is the single source
of truth for both services; `spx-service` pulls it from
`GET /api/spiderx-configuration` at startup and every 2 minutes.

Load order, last wins:

1. bundled `config/spiderx.yml`
2. `/etc/spiderx/spiderx.yml` — appliance overlay, seeded on first install
3. environment variables — `ES_*`, `MYSQL_*`, `SPIDERX_*`, `PORT`

`setup_info.json` is applied between 1 and 2 for Elasticsearch/MySQL host discovery.

Because the file defines both services' ports, changing where the backend listens
is a `spx-ui` change:

```yaml
server:  { port: 4000, ... }   # spx-ui
service: { port: 8082, ... }   # spx-service
```

## TLS

```
/usr/local/share/ca-certificates/VEHERE.crt
/usr/local/share/ca-certificates/VEHERE.key
```

Override via `filePath.server_ssl_certificate` / `server_ssl_key`, or
`SPIDERX_SSL_CERT` / `SPIDERX_SSL_KEY`. Missing certs fall back to HTTP.

## Develop

```bash
npm install
npm run dev        # :4000
```

## Build and package

```bash
npm run build      # next build + buildInfo.txt
./debBuild.sh      # → spx-ui.deb
sudo dpkg -i spx-ui.deb
```

Installs to `/usr/local/lib/spx-ui/`, bundles its own Node under `node/`,
registers `spx-ui.service`, and seeds `/etc/spiderx/spiderx.yml` on first install.

## Note on ports

`:4000` and `:8082` are the ports `vehere-ui` and `uiservice` use, so SpiderX
cannot share a host with them. Change both in `config/spiderx.yml` if you need
them side by side — nothing is hardcoded.
