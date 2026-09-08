# SpiderX architecture

```
Browser  →  SpiderX / ndr-pulse (Next.js :3010, HTTPS via server.js + VEHERE.crt/key)
              ├─ config: config/spiderx.yml → /etc/spiderx/spiderx.yml → setup_info.json → env
              ├─ /api/v1/*          Next route handlers (ES + MySQL from config)
              └─ rewrite fallback   uiServices-ndr (:8083) for /api/v1/dashboard/*

uiServices-ndr (:8083)  — companion Express API (does NOT modify ../uiServices)
Original uiServices     — UNTOUCHED production backend
ES + MySQL              — hosts/creds from spiderx.yml (install writes overlay)
```

## Production install

See [DEPLOY.md](DEPLOY.md): `install.sh`, `setup_db.sh`, `es_db_setup.sh`, `debBuild.sh`, certs under `/usr/local/share/ca-certificates/VEHERE.{crt,key}`.

## Why uiServices-ndr looked "dead"

1. **SpiderX talks to its own Next APIs**, not to `:8083`. `src/lib/uiservice.ts` existed but was never imported by pages.
2. **uiServices-ndr often wasn't running** — it only starts via `scripts/start-stack.sh` or `npm start` in that folder.
3. **No rewrite** until now — dashboard CMS paths can fall back to `:8083`.

## Run both

```bash
# terminal A
cd /home/vehere/workspace/VUI/uiServices-ndr && npm start   # :8083

# terminal B
cd /home/vehere/workspace/VUI/ndr-pulse && npm run dev:live # :3010
```

Or: `bash /home/vehere/workspace/VUI/ndr-pulse/scripts/start-stack.sh` (production start).

Check: `curl http://127.0.0.1:8083/` and `curl http://127.0.0.1:3010/api/v1/system/config`
