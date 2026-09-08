import { NextResponse } from "next/server";
import { getAppConfig, getEsPrimaryHost, getMysqlConfig, getSslPaths, sslEnabled } from "@/lib/app-config";

/** Non-secret view of effective runtime config (for install verification). */
export async function GET() {
  const cfg = getAppConfig();
  const mysql = getMysqlConfig();
  const ssl = getSslPaths();
  return NextResponse.json({
    ok: true,
    server: cfg.server,
    elasticsearch: {
      hosts: cfg.elasticsearch_config?.hosts,
      primary: getEsPrimaryHost(),
      username: cfg.elasticsearch_config?.username,
      rejectUnauthorized: cfg.elasticsearch_config?.rejectUnauthorized === true,
    },
    mysql: {
      host: mysql.host,
      port: mysql.port,
      database: mysql.database,
      user: mysql.user,
    },
    auth: {
      totpIssuer: cfg.auth?.APP_TOTP_ISSUER,
      platformMfa: !!cfg.auth?.platform_mfa,
      sessionMaxAgeSec: cfg.auth?.session_cookie_expiresIn_sec,
    },
    tls: {
      enabled: sslEnabled(),
      certificate: ssl.cert,
      key: ssl.key,
    },
    uiservice: cfg.uiservice?.url,
  });
}
