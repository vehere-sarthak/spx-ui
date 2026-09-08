# SpiderX production deployment

Mirrors **vehere-ui** appliance install: `setup_info.json` → overlay YAML → MySQL/ES bootstrap → HTTPS certs → deb/systemd.

## Config merge (runtime)

1. Bundled [`config/spiderx.yml`](config/spiderx.yml)
2. Overlay `/etc/spiderx/spiderx.yml` (written by `install.sh`)
3. `/usr/local/etc/setup_info.json` (ES `database.master`, app IP → MySQL host, `app.mfa`)
4. Env overrides: `MYSQL_*`, `ES_*`, `SPIDERX_SESSION_SECRET`, `APP_TOTP_ISSUER`, `SPIDERX_SSL_CERT`, `SPIDERX_SSL_KEY`, `PORT`

MySQL + Elasticsearch credentials are **not** hardcoded in app libs anymore — they come from this chain.

## HTTPS / MFA certs

Platform files (same as vehere-ui):

- `/usr/local/share/ca-certificates/VEHERE.crt`
- `/usr/local/share/ca-certificates/VEHERE.key`

`server.js` starts **HTTPS on :3010** when both exist; otherwise HTTP. Session cookies use `secure` when TLS is active. TOTP issuer = `auth.APP_TOTP_ISSUER` from config (default `SpiderX`). MFA/TOTP columns are created by `setup_db.sh`.

## Scripts

| Script | Role |
|--------|------|
| `install.sh` | App-node install from `setup_info.json` |
| `setup_db.sh` | MySQL `ui_db` + MFA/TOTP columns |
| `es_db_setup.sh` | SpiderX ES indices (subset) |
| `export_setup.sh` | nginx :8800 SSL export dir |
| `debBuild.sh` | Build `spiderx.deb` + systemd |

HA MySQL / offline MySQL install reuse **vehere-ui** scripts via `VEHERE_UI_DIR` (default `../vehere-ui`). Full ES index suite: `../vehere-ui/es_db_setup.sh`.

## Lab / without appliance

```bash
sudo mkdir -p /etc/spiderx
sudo cp config/spiderx.yml /etc/spiderx/spiderx.yml
# edit hosts/passwords in /etc/spiderx/spiderx.yml

# optional TLS
# sudo cp VEHERE.crt VEHERE.key /usr/local/share/ca-certificates/

./setup_db.sh
ES_HOST=https://127.0.0.1:9200 ./es_db_setup.sh

npm run build
npm run start:prod   # node server.js (HTTPS if certs present)
```

## Package install (appliance)

```bash
./debBuild.sh
./install.sh          # needs setup_info.json
systemctl status spiderx
```

## Dev

`.env.local` still works — env wins over YAML. `npm run dev` stays HTTP :3010.
