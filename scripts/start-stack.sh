#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VUI="$(cd "$ROOT/.." && pwd)"
UIS="${VUI}/uiServices-ndr"

pkill -f 'uiServices-ndr/src/server.js' 2>/dev/null || true
pkill -f 'next start.*301 3010' 2>/dev/null || true
pkill -f 'node server.js' 2>/dev/null || true
sleep 1

if [[ -d "$UIS" ]]; then
  cd "$UIS"
  node src/server.js > /tmp/uiservices-ndr.log 2>&1 &
  echo $! > /tmp/uiservices-ndr.pid
  echo "uiServices-ndr PID $(cat /tmp/uiservices-ndr.pid) -> http://127.0.0.1:8083"
else
  echo "WARN: $UIS not found — continuing with SpiderX only"
fi

cd "$ROOT"
if [[ -d .next ]]; then
  NODE_ENV=production node server.js > /tmp/ndr-pulse.log 2>&1 &
else
  npx next start -H 0.0.0.0 -p 3010 > /tmp/ndr-pulse.log 2>&1 &
fi
echo $! > /tmp/ndr-pulse.pid

sleep 2
echo "ndr-pulse PID $(cat /tmp/ndr-pulse.pid) -> http(s)://0.0.0.0:3010"
echo "Config: /etc/spiderx/spiderx.yml or config/spiderx.yml (see DEPLOY.md)"
tail -n 8 /tmp/ndr-pulse.log || true
