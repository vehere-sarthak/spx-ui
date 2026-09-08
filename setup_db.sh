#!/bin/bash
# Create / migrate MySQL ui_db for SpiderX (vehere-ui setup_db.sh compatible + MFA/TOTP).
set -euo pipefail

SETUP_INFO="${SETUP_INFO:-/usr/local/etc/setup_info.json}"
MYSQL_USER="${MYSQL_USER:-vehere}"
MYSQL_PASS="${MYSQL_PASS:-CHANGEME}"
MYSQL_HOST="${MYSQL_HOST:-localhost}"
DB_NAME="${MYSQL_DATABASE:-ui_db}"
LANDING_PAGE="command"

if [[ -f "$SETUP_INFO" ]] && command -v jq >/dev/null 2>&1; then
  SYSTEM_TYPE="$(jq -r '.system.type // empty' "$SETUP_INFO" 2>/dev/null || true)"
  # Keep vehere landing id for roles that still store mcsConfiguration; SpiderX maps it at login.
  if echo "$SYSTEM_TYPE" | grep -qiE 'CMS|NS|Packetworker'; then
    LANDING_PAGE="mcsConfiguration"
  fi
fi

# Prefer overlay config for MySQL host
if [[ -f /etc/spiderx/spiderx.yml ]]; then
  H=$(grep -E '^\s*host:' /etc/spiderx/spiderx.yml | head -1 | sed -E "s/.*host:[[:space:]]*'?([^',}]+)'?.*/\1/" || true)
  [[ -n "${H:-}" ]] && MYSQL_HOST="$H"
fi

MYSQL_CMD=(mysql -h "$MYSQL_HOST" -u "$MYSQL_USER" "-p${MYSQL_PASS}")

echo "[setup_db] host=$MYSQL_HOST db=$DB_NAME landing=$LANDING_PAGE"

"${MYSQL_CMD[@]}" <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`;
USE \`${DB_NAME}\`;

CREATE TABLE IF NOT EXISTS control_table (
  key_name VARCHAR(255) PRIMARY KEY,
  value VARCHAR(1000) DEFAULT NULL,
  expiry_time bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS roles (
  id int NOT NULL AUTO_INCREMENT,
  role_name varchar(50) NOT NULL,
  permissions varchar(1000) NOT NULL,
  system_name varchar(1000) NULL,
  created_by varchar(50) NOT NULL,
  created_on bigint NOT NULL,
  last_modified_by varchar(50) NOT NULL,
  last_modified_on bigint NOT NULL,
  landingPage varchar(255) DEFAULT NULL,
  is_cms tinyint DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY role_name_UNIQUE (role_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id int NOT NULL AUTO_INCREMENT,
  user_id varchar(50) NOT NULL,
  role_id int NOT NULL,
  user_name varchar(50) NOT NULL,
  user_pass varchar(100) NOT NULL,
  email_id varchar(100) DEFAULT NULL,
  mfa_email_id varchar(255) NOT NULL DEFAULT '',
  mfa_enabled tinyint(1) NOT NULL DEFAULT 0,
  mfa_otp VARCHAR(255) DEFAULT NULL,
  theme varchar(50) NOT NULL DEFAULT 'dark',
  login_flag tinyint NOT NULL DEFAULT 0,
  created_by varchar(50) NOT NULL,
  created_on bigint NOT NULL,
  last_modified_by varchar(50) NOT NULL,
  last_modified_on bigint NOT NULL,
  password_expiry bigint NOT NULL DEFAULT 0,
  is_new tinyint NOT NULL DEFAULT 1,
  profile_picture mediumtext,
  login_attempt_count int DEFAULT NULL,
  last_login_attempt_time bigint DEFAULT NULL,
  first_login_attempt_time bigint DEFAULT NULL,
  email_verified tinyint(1) NOT NULL DEFAULT 0,
  email_otp VARCHAR(255) DEFAULT NULL,
  totp_secret VARCHAR(255) DEFAULT NULL,
  totp_recovery_codes TEXT DEFAULT NULL,
  totp_enabled tinyint(1) NOT NULL DEFAULT 0,
  is_cms tinyint DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY user_id_UNIQUE (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_session (
  id int NOT NULL AUTO_INCREMENT,
  user_id varchar(50) NOT NULL,
  session_key varchar(100) NOT NULL,
  last_access bigint NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS save_search (
  id int NOT NULL AUTO_INCREMENT,
  title varchar(50) NOT NULL,
  isPrivate tinyint NOT NULL DEFAULT 0,
  startDateTime bigint NOT NULL,
  endDateTime bigint NOT NULL,
  timePickerType varchar(50) NOT NULL,
  filter varchar(10000) NOT NULL,
  searchQuery varchar(200) NOT NULL,
  columns varchar(5000) NOT NULL,
  created_by varchar(50) NOT NULL,
  created_on bigint NOT NULL,
  last_modified_by varchar(50) NOT NULL,
  last_modified_on bigint NOT NULL,
  moduleId varchar(50) NOT NULL,
  users varchar(500) DEFAULT NULL,
  is_history tinyint NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY title_UNIQUE (title)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS spx_management (
  id int NOT NULL AUTO_INCREMENT,
  name varchar(100) NOT NULL,
  ip_address varchar(50) NOT NULL,
  username varchar(100) NOT NULL,
  password varchar(512) NOT NULL,
  created_by varchar(50) DEFAULT NULL,
  created_on bigint DEFAULT NULL,
  last_modified_by varchar(50) DEFAULT NULL,
  last_modified_on bigint DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY spx_management_ip_UNIQUE (ip_address)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
SQL

add_col() {
  local col="$1" ddl="$2"
  local exists
  exists=$("${MYSQL_CMD[@]}" -N -e "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='${DB_NAME}' AND TABLE_NAME='users' AND COLUMN_NAME='${col}';")
  if [[ "$exists" == "0" ]]; then
    echo "[MFA/TOTP] ADD COLUMN users.${col}"
    "${MYSQL_CMD[@]}" -e "ALTER TABLE ${DB_NAME}.users ADD COLUMN ${ddl};"
  else
    echo "[MFA/TOTP] users.${col} exists"
  fi
}

add_col mfa_email_id "mfa_email_id varchar(255) NOT NULL DEFAULT ''"
add_col mfa_enabled "mfa_enabled tinyint(1) NOT NULL DEFAULT 0"
add_col mfa_otp "mfa_otp VARCHAR(255) DEFAULT NULL"
add_col totp_secret "totp_secret VARCHAR(255) DEFAULT NULL"
add_col totp_recovery_codes "totp_recovery_codes TEXT DEFAULT NULL"
add_col totp_enabled "totp_enabled tinyint(1) NOT NULL DEFAULT 0"
add_col email_verified "email_verified tinyint(1) NOT NULL DEFAULT 0"
add_col email_otp "email_otp VARCHAR(255) DEFAULT NULL"

NOW=$(date +%s)
# Seed admin role + user only if empty (password MD5 of CHANGEME = classic lab)
ADMIN_PASS_MD5="a1b2c3d4e5f6" # placeholder — prefer existing DB
# Use known vehere default md5 if we can compute
if command -v md5sum >/dev/null 2>&1; then
  ADMIN_PASS_MD5=$(printf '%s' 'CHANGEME' | md5sum | awk '{print $1}')
elif command -v md5 >/dev/null 2>&1; then
  ADMIN_PASS_MD5=$(printf '%s' 'CHANGEME' | md5)
fi

ROLE_CNT=$("${MYSQL_CMD[@]}" -N -e "SELECT COUNT(*) FROM ${DB_NAME}.roles;")
if [[ "$ROLE_CNT" == "0" ]]; then
  echo "[setup_db] seeding default Admin role (landing=${LANDING_PAGE})"
  "${MYSQL_CMD[@]}" -e "INSERT INTO ${DB_NAME}.roles
    (role_name, permissions, system_name, created_by, created_on, last_modified_by, last_modified_on, landingPage)
    VALUES ('Admin', 'all', 'SpiderX', 'system', ${NOW}, 'system', ${NOW}, '${LANDING_PAGE}');"
fi

USER_CNT=$("${MYSQL_CMD[@]}" -N -e "SELECT COUNT(*) FROM ${DB_NAME}.users;")
if [[ "$USER_CNT" == "0" ]]; then
  ROLE_ID=$("${MYSQL_CMD[@]}" -N -e "SELECT id FROM ${DB_NAME}.roles ORDER BY id LIMIT 1;")
  echo "[setup_db] seeding admin user (admin / CHANGEME)"
  "${MYSQL_CMD[@]}" -e "INSERT INTO ${DB_NAME}.users
    (user_id, role_id, user_name, user_pass, theme, login_flag, created_by, created_on, last_modified_by, last_modified_on, password_expiry, is_new, mfa_enabled, totp_enabled)
    VALUES ('admin', ${ROLE_ID}, 'Administrator', '${ADMIN_PASS_MD5}', 'dark', 0, 'system', ${NOW}, 'system', ${NOW}, $((NOW + 2592000)), 0, 0, 0);"
fi

echo "[setup_db] done"
