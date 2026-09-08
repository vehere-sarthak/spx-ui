#!/bin/bash
# SpiderX production installer (mirrors vehere-ui/install.sh flow for app nodes).
# Requires: /usr/local/etc/setup_info.json, jq, dpkg/systemctl on appliance.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

CONFIG_FILE="/usr/local/etc/setup_info.json"
OUTPUT_DIR="/etc/spiderx"
OUTPUT_FILE="${OUTPUT_DIR}/spiderx.yml"
VEHERE_UI_DIR="${VEHERE_UI_DIR:-$(cd "$SCRIPT_DIR/../vehere-ui" 2>/dev/null && pwd || true)}"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Error: Config file $CONFIG_FILE not found!" >&2
  echo "On lab/dev you can skip install.sh and copy config/spiderx.yml → $OUTPUT_FILE" >&2
  exit 1
fi

command -v jq >/dev/null 2>&1 || { echo "Error: jq required"; exit 1; }

GUI_HA_ENABLED=false
PRIMARY_IP=""
BACKUP_IP=""
if jq -e '.guiha' "$CONFIG_FILE" >/dev/null 2>&1; then
  GUI_HA_ENABLED=true
  PRIMARY_IP=$(jq -r '.guiha.pip[0] // empty' "$CONFIG_FILE")
  BACKUP_IP=$(jq -r '.guiha.bip[0] // empty' "$CONFIG_FILE")
fi

LOCAL_IP=$(jq -r '.local.ip[0]' "$CONFIG_FILE")
mapfile -t APP_IPS < <(jq -r '.app.ip[]' "$CONFIG_FILE" 2>/dev/null)
mapfile -t DB_MASTER_IPS < <(jq -r '.database.master[]? // empty' "$CONFIG_FILE" 2>/dev/null)

if [[ -z "$LOCAL_IP" || "$LOCAL_IP" == "null" || "${#APP_IPS[@]}" -eq 0 ]]; then
  echo "Error: Failed to extract valid IPs from $CONFIG_FILE" >&2
  exit 1
fi

IS_APP_NODE=false
APP_ENDPOINT=""
for ip in "${APP_IPS[@]}"; do
  if [[ "$LOCAL_IP" == "$ip" ]]; then
    IS_APP_NODE=true
    APP_ENDPOINT="$ip"
    break
  fi
done

IS_BACKUP=false
if [[ "$GUI_HA_ENABLED" == true && "$LOCAL_IP" == "$BACKUP_IP" ]]; then
  IS_BACKUP=true
fi

MYSQL_INSTALLED=false
command -v mysql >/dev/null 2>&1 && MYSQL_INSTALLED=true

ensure_mysql_running() {
  if systemctl list-unit-files 2>/dev/null | grep -q '^mysql\.service'; then
    systemctl start mysql || true
  elif systemctl list-unit-files 2>/dev/null | grep -q '^mysqld\.service'; then
    systemctl start mysqld || true
  fi
  mysqladmin ping >/dev/null 2>&1 || { echo "ERROR: MySQL not responding"; exit 1; }
}

if [[ "$IS_APP_NODE" != true ]]; then
  echo "Not an APP node ($LOCAL_IP). Skipping SpiderX app install."
  exit 0
fi

echo "APP node $LOCAL_IP — installing SpiderX"

if [[ "$MYSQL_INSTALLED" == false ]]; then
  if [[ -n "$VEHERE_UI_DIR" && -x "$VEHERE_UI_DIR/install_mysql.sh" ]]; then
    echo "Installing MySQL via vehere-ui/install_mysql.sh"
    (cd "$VEHERE_UI_DIR" && ./install_mysql.sh)
  else
    echo "ERROR: MySQL missing and install_mysql.sh not found (set VEHERE_UI_DIR)" >&2
    exit 1
  fi
fi
ensure_mysql_running

if [[ "$GUI_HA_ENABLED" == true && "$IS_BACKUP" == true ]]; then
  if [[ -n "$VEHERE_UI_DIR" && -x "$VEHERE_UI_DIR/clone_from_primary.sh" ]]; then
    (cd "$VEHERE_UI_DIR" && ./clone_from_primary.sh)
  else
    echo "ERROR: HA backup needs clone_from_primary.sh" >&2
    exit 1
  fi
else
  chmod +x ./setup_db.sh
  ./setup_db.sh
fi

chmod +x ./es_db_setup.sh
./es_db_setup.sh

if [[ -f ./export_setup.sh ]]; then
  chmod +x ./export_setup.sh
  ./export_setup.sh || echo "WARN: export_setup.sh failed (nginx/certs may be missing)"
fi

# Write runtime overlay (ES + MySQL hosts) — same role as /etc/vehere-ui/vehereui.yml
mkdir -p "$OUTPUT_DIR"
if [[ ${#DB_MASTER_IPS[@]} -eq 0 ]]; then
  ES_HOSTS_CONFIG="\"https://${APP_ENDPOINT}:9200/\""
elif [[ ${#DB_MASTER_IPS[@]} -eq 1 ]]; then
  ES_HOSTS_CONFIG="\"https://${DB_MASTER_IPS[0]}:9200/\""
else
  ES_HOSTS_ARRAY=""
  for ip in "${DB_MASTER_IPS[@]}"; do
    [[ -n "$ES_HOSTS_ARRAY" ]] && ES_HOSTS_ARRAY+=", "
    ES_HOSTS_ARRAY+="\"https://${ip}:9200/\""
  done
  ES_HOSTS_CONFIG="[${ES_HOSTS_ARRAY}]"
fi

cat > "$OUTPUT_FILE" <<EOF
elasticsearch_config: {
  hosts: ${ES_HOSTS_CONFIG},
}
mySQL_config: {
  host: '${APP_ENDPOINT}',
}
filePath: {
  server_ssl_certificate: '/usr/local/share/ca-certificates/VEHERE.crt',
  server_ssl_key: '/usr/local/share/ca-certificates/VEHERE.key',
}
EOF
echo "Wrote $OUTPUT_FILE"

if [[ -f ./spiderx.deb ]]; then
  dpkg -i ./spiderx.deb
elif [[ -f ./ndr-pulse.deb ]]; then
  dpkg -i ./ndr-pulse.deb
else
  echo "WARN: spiderx.deb not found — run ./debBuild.sh first, or npm run build && node server.js"
fi

# Optional companion API
UIS_DEB="${SCRIPT_DIR}/../uiServices-ndr/uiservices-ndr.deb"
UIS_ORIG="${SCRIPT_DIR}/../uiServices/uiservice.deb"
if [[ -f ./uiservices-ndr.deb ]]; then
  dpkg -i ./uiservices-ndr.deb || true
elif [[ -f "$UIS_DEB" ]]; then
  dpkg -i "$UIS_DEB" || true
elif [[ -f "$UIS_ORIG" ]]; then
  echo "NOTE: installing classic uiservice.deb (optional companion)"
  dpkg -i "$UIS_ORIG" || true
fi

if [[ "$GUI_HA_ENABLED" == true && -n "$VEHERE_UI_DIR" ]]; then
  (cd "$VEHERE_UI_DIR" && chmod +x install_mysql_ha.sh install_mysql_watchdog.sh install_keepalived_watchdog.sh
   ./install_mysql_ha.sh
   ./install_mysql_watchdog.sh
   ./install_keepalived_watchdog.sh) || echo "WARN: MySQL HA scripts failed"
fi

echo "=========================================="
echo "SpiderX installation finished"
echo "  Config: $OUTPUT_FILE"
echo "  Certs:  /usr/local/share/ca-certificates/VEHERE.{crt,key}"
echo "  UI:     https://${APP_ENDPOINT}:3010 (systemd spiderx)"
echo "=========================================="
