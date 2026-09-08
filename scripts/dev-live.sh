#!/usr/bin/env bash
# Start ndr-pulse with proxies cleared so Node can reach ES on the LAN.
set -euo pipefail
cd "$(dirname "$0")/.."

unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY all_proxy || true
export NO_PROXY='*'
export no_proxy='*'
# next@14.2.35 ships no matching @next/swc-* build (they stop at 14.2.33), so
# Next's lockfile patcher throws every start. Nothing here needs it.
export NEXT_IGNORE_INCORRECT_LOCKFILE=1

export ES_HOST="${ES_HOST:-https://127.0.0.1:9200}"
export ES_USERNAME="${ES_USERNAME:-admin}"
export ES_PASSWORD="${ES_PASSWORD:-CHANGEME}"

fuser -k 3010/tcp 2>/dev/null || true
exec npx next dev -H 0.0.0.0 -p 3010
