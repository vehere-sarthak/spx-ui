#!/bin/bash
# Bootstrap Elasticsearch indices used by SpiderX.
# Creds: configure_server (appliance) → /etc/spiderx/spiderx.yml → env.
set -euo pipefail

ESHOST=""
ESUSER=""
ESPASS=""

if command -v configure_server >/dev/null 2>&1; then
  DBIP=$(configure_server getbasicinfo database_master 2>/dev/null || true)
  ESUSER=$(configure_server getbasicinfo database_u 2>/dev/null || true)
  ESPASS=$(configure_server getbasicinfo database_p 2>/dev/null || true)
  [[ -n "$DBIP" ]] && ESHOST="https://${DBIP}:9200"
fi

# Overlay from spiderx.yml (hosts / username / password)
parse_yml_val() {
  local key="$1" file="$2"
  grep -E "^[[:space:]]*${key}:" "$file" 2>/dev/null | head -1 | sed -E "s/.*${key}:[[:space:]]*'?([^',}]+)'?.*/\1/" || true
}

if [[ -f /etc/spiderx/spiderx.yml ]]; then
  H=$(parse_yml_val hosts /etc/spiderx/spiderx.yml)
  [[ "$H" == \[* ]] && H=$(echo "$H" | sed -E 's/\["?([^"]+)"?.*/\1/')
  [[ -n "$H" && "$H" != hosts ]] && ESHOST="${H%/}"
  U=$(parse_yml_val username /etc/spiderx/spiderx.yml)
  P=$(parse_yml_val password /etc/spiderx/spiderx.yml)
  [[ -n "$U" && "$U" != username ]] && ESUSER="$U"
  [[ -n "$P" && "$P" != password ]] && ESPASS="$P"
fi

# Bundled defaults
if [[ -z "$ESHOST" && -f "$(dirname "$0")/config/spiderx.yml" ]]; then
  H=$(parse_yml_val hosts "$(dirname "$0")/config/spiderx.yml")
  [[ -n "$H" ]] && ESHOST="${H%/}"
fi

ESHOST="${ES_HOST:-$ESHOST}"
ESUSER="${ES_USERNAME:-${ESUSER:-admin}}"
ESPASS="${ES_PASSWORD:-${ESPASS:-CHANGEME}}"

if [[ -z "$ESHOST" ]]; then
  echo "ERROR: ES host unknown. Set ES_HOST or run on appliance with configure_server / setup_info." >&2
  exit 1
fi

ESHOST="${ESHOST%/}"
AUTH=(-u "${ESUSER}:${ESPASS}" --insecure)
echo "[es_db_setup] ${ESHOST} as ${ESUSER}"

es_exists() {
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "${AUTH[@]}" "${ESHOST}/$1")
  [[ "$code" == "200" ]]
}

es_put() {
  local index="$1" body="$2"
  if es_exists "$index"; then
    echo "  exists: $index"
    curl -s -XPUT "${AUTH[@]}" "${ESHOST}/${index}/_settings" \
      -H 'Content-Type: application/json' \
      -d '{"index":{"max_result_window":200000}}' >/dev/null || true
    return 0
  fi
  echo "  create: $index"
  curl -s -XPUT "${AUTH[@]}" "${ESHOST}/${index}" \
    -H 'Content-Type: application/json' \
    -d "$body" | head -c 200
  echo
  curl -s -XPUT "${AUTH[@]}" "${ESHOST}/${index}/_settings" \
    -H 'Content-Type: application/json' \
    -d '{"index":{"max_result_window":200000}}' >/dev/null || true
}

KW='{"type":"keyword"}'
DATE='{"type":"date"}'
TEXT='{"type":"text"}'
LONG='{"type":"long"}'
BOOL='{"type":"boolean"}'
# Searchable text that also needs an exact `.keyword` subfield for terms/aggs.
TXTKW='{"type":"text","fields":{"keyword":{"type":"keyword","ignore_above":1024}}}'

# Indices SpiderX actually queries. Mappings mirror the fields used by
# src/lib/targets.ts, src/lib/es-server.ts and the /api/v1 route handlers —
# keep them in step when a query starts touching a new field.

# capture-input-identification (udf_iface)
es_put "udf_iface" "{\"mappings\":{\"properties\":{\"title\":$TXTKW,\"type\":$TXTKW,\"value\":$TXTKW,\"created_by\":$TXTKW,\"created_on\":$LONG,\"last_modified_by\":$TXTKW,\"last_modified_on\":$LONG}}}"

# capture_filter — target rules; looked up by reference_id.keyword
es_put "capture_filter" "{\"mappings\":{\"properties\":{\"reference_id\":$TXTKW,\"name\":$TXTKW,\"condition\":$TEXT,\"targetvalue\":$TXTKW,\"enabled\":$BOOL,\"created_by\":$TXTKW,\"created_on\":$LONG,\"last_modified_by\":$TXTKW,\"last_modified_on\":$LONG}}}"

# target_managements — EOI/target records
es_put "target_managements" "{\"mappings\":{\"properties\":{\"personalInfo\":{\"properties\":{\"alias\":$TXTKW,\"firstName\":$TXTKW,\"lastName\":$TXTKW,\"priority\":$TXTKW,\"description\":$TEXT}},\"targetValue\":$TXTKW,\"condition\":$TEXT,\"enabled\":$BOOL,\"shared\":$KW,\"assignTo\":$KW,\"interceptionCriteria\":{\"properties\":{\"assignTo\":$KW}},\"activeFromTZ\":$DATE,\"validTillTZ\":$DATE,\"created_by\":$TXTKW,\"created_on\":$LONG,\"last_modified_by\":$TXTKW,\"last_modified_on\":$LONG}}}"

# audittrail — fields must match the /api/v1/audittrail reader
es_put "audittrail" "{\"mappings\":{\"properties\":{\"@timestamp\":$DATE,\"username\":$TXTKW,\"clientIp\":$TXTKW,\"category\":$TXTKW,\"module\":$TXTKW,\"event\":$TXTKW,\"eventMessage\":$TEXT,\"details\":$TEXT}}}"

# frame_dumps-* — target frame capture, joined by ref_id/reference_id
DATE_IDX=$(date +%Y.%m.%d)
es_put "frame_dumps-${DATE_IDX}" "{\"mappings\":{\"properties\":{\"@timestamp\":$DATE,\"ref_id\":$TXTKW,\"reference_id\":$TXTKW,\"link_name\":$TXTKW,\"iface_name\":$TXTKW,\"frame_len\":$LONG,\"src_ip\":$TXTKW,\"dst_ip\":$TXTKW,\"hexdump\":$TEXT}}}"

# Seed daily indices so UI searches do not hard-404 on an empty cluster.
for pattern_base in logvehere-alerts logvehere-monitor link-stats soi-stats; do
  idx="${pattern_base}-${DATE_IDX}"
  es_put "$idx" "{\"mappings\":{\"properties\":{\"@timestamp\":$DATE,\"value\":$TXTKW,\"alert_name\":$TXTKW,\"priority\":$TXTKW,\"link_name\":$TXTKW,\"probe_host_name\":$TXTKW,\"probe_ip\":$TXTKW,\"hit_count\":$LONG,\"total_bytes\":$LONG,\"total_packets\":$LONG,\"type\":$TXTKW,\"alert_type\":$TXTKW}}}"
done

echo "[es_db_setup] done"
