#!/bin/bash
# Build spiderx.deb (Next standalone-ish package with bundled Node) — mirrors vehere-ui/debBuild.sh
set -euo pipefail

APP_NAME="spx-ui"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

DEB_BUILD_FOLDER="./$APP_NAME"
DEB_FILE="./$APP_NAME.deb"
rm -rf "$DEB_BUILD_FOLDER" "$DEB_FILE"

echo "Building Next production bundle…"
npm run build

NODE_VERSION=$(cat .nvmrc 2>/dev/null || echo "v22.17.1")
NODE_DIST="node-${NODE_VERSION}-linux-x64"
NODE_TARBALL="${NODE_DIST}.tar.xz"
NODE_URL="https://nodejs.org/dist/${NODE_VERSION}/${NODE_TARBALL}"

mkdir -p "$APP_NAME/DEBIAN"
mkdir -p "$APP_NAME/usr/local/lib/$APP_NAME/node"
mkdir -p "$APP_NAME/usr/local/lib/$APP_NAME/config"
mkdir -p "$APP_NAME/usr/local/bin"
mkdir -p "$APP_NAME/lib/systemd/system"
mkdir -p "$APP_NAME/etc/spiderx"

cat > "$APP_NAME/DEBIAN/control" <<EOF
Package: $APP_NAME
Version: 0.1.0
Section: web
Priority: optional
Architecture: amd64
Maintainer: Vehere
Depends: jq
Description: SpiderX NDR UI (Next.js) systemd service on port 3010.
EOF

cat > "$APP_NAME/lib/systemd/system/$APP_NAME.service" <<EOF
[Unit]
Description=SpiderX NDR UI
After=network.target mysql.service

[Service]
ExecStart=/usr/local/lib/$APP_NAME/node/bin/node /usr/local/lib/$APP_NAME/server.js
Restart=always
User=root
Group=root
Environment=NODE_ENV=production PORT=4000
WorkingDirectory=/usr/local/lib/$APP_NAME
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=$APP_NAME
EnvironmentFile=-/usr/local/lib/$APP_NAME/.env.production
EnvironmentFile=-/etc/spiderx/spiderx.env

[Install]
WantedBy=multi-user.target
EOF

cat > "$APP_NAME/DEBIAN/postinst" <<'EOF'
#!/bin/sh
set -e
mkdir -p /etc/spiderx
cp /lib/systemd/system/$APP_NAME.service /etc/systemd/system/$APP_NAME.service
systemctl daemon-reload
systemctl enable spiderx
systemctl restart spiderx || systemctl start spiderx
exit 0
EOF
chmod +x "$APP_NAME/DEBIAN/postinst"

cat > "$APP_NAME/DEBIAN/prerm" <<'EOF'
#!/bin/sh
set -e
systemctl stop spiderx || true
systemctl disable spiderx || true
rm -f /etc/systemd/system/$APP_NAME.service
systemctl daemon-reload
exit 0
EOF
chmod +x "$APP_NAME/DEBIAN/prerm"

cat > "$APP_NAME/usr/local/bin/$APP_NAME" <<EOF
#!/bin/sh
exec /usr/local/lib/$APP_NAME/node/bin/node /usr/local/lib/$APP_NAME/server.js "\$@"
EOF
chmod +x "$APP_NAME/usr/local/bin/$APP_NAME"

echo "Bundling Node ${NODE_VERSION}…"
wget -q "$NODE_URL" -O "$NODE_TARBALL"
tar -xJf "$NODE_TARBALL" --strip-components=1 -C "$APP_NAME/usr/local/lib/$APP_NAME/node"
rm -f "$NODE_TARBALL"

rsync -a --exclude='.next/cache' .next "$APP_NAME/usr/local/lib/$APP_NAME/"
cp -a node_modules "$APP_NAME/usr/local/lib/$APP_NAME/"
cp package.json package-lock.json next.config.mjs server.js "$APP_NAME/usr/local/lib/$APP_NAME/" 2>/dev/null || \
  cp package.json next.config.mjs server.js "$APP_NAME/usr/local/lib/$APP_NAME/"
cp -a public "$APP_NAME/usr/local/lib/$APP_NAME/" 2>/dev/null || mkdir -p "$APP_NAME/usr/local/lib/$APP_NAME/public"
cp -a config/spiderx.yml config/load-config.cjs "$APP_NAME/usr/local/lib/$APP_NAME/config/"
[[ -f .env.production ]] && cp .env.production "$APP_NAME/usr/local/lib/$APP_NAME/" || \
  echo "NEXT_PUBLIC_ENV=production" > "$APP_NAME/usr/local/lib/$APP_NAME/.env.production"

# Sample overlay (install.sh overwrites hosts)
cp config/spiderx.yml "$APP_NAME/etc/spiderx/spiderx.yml.example"

dpkg-deb --build "$APP_NAME"
rm -rf "$APP_NAME"
echo "Built $DEB_FILE"
