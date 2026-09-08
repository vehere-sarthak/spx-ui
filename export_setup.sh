#!/bin/bash
# Nginx SSL static export site on :8800 (same as vehere-ui/export_setup.sh).
# Uses VEHERE.crt / VEHERE.key from platform CA path.
set -euo pipefail

CERT="${SPIDERX_SSL_CERT:-/usr/local/share/ca-certificates/VEHERE.crt}"
KEY="${SPIDERX_SSL_KEY:-/usr/local/share/ca-certificates/VEHERE.key}"

echo "[export_setup] starting…"
mkdir -p /var/www/export_zip_file
chmod 755 /var/www/export_zip_file

if [[ ! -f "$CERT" || ! -f "$KEY" ]]; then
  echo "WARN: missing $CERT or $KEY — skip nginx SSL export site"
  exit 0
fi

if ! command -v nginx >/dev/null 2>&1; then
  echo "WARN: nginx not installed — skip export site"
  exit 0
fi

systemctl enable nginx || true

CONFIG_PATH="/etc/nginx/sites-available/export_zip_file"
cat > "$CONFIG_PATH" <<EOF
server {
        listen 8800 ssl;
        ssl_certificate ${CERT};
        ssl_certificate_key ${KEY};
        root /var/www/export_zip_file;
        index index.html;
        server_name _;
        location / {
                try_files \$uri \$uri/ =404;
        }
}
EOF

ln -sfn "$CONFIG_PATH" /etc/nginx/sites-enabled/export_zip_file
if [[ -L /etc/nginx/sites-enabled/default ]]; then
  unlink /etc/nginx/sites-enabled/default || true
fi

nginx -t
systemctl restart nginx
echo "[export_setup] https://0.0.0.0:8800/ → /var/www/export_zip_file"
