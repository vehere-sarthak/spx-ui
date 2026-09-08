import { getAppConfig } from "@/lib/app-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Non-secret: tells the browser which port spx-service listens on so the API
 * client can build its base URL. The host comes from window.location, so this
 * works unchanged behind any appliance address.
 */
export async function GET() {
  const cfg = getAppConfig();
  return Response.json({
    servicePort: cfg.service?.port ?? 8082,
    apiPrefix: cfg.service?.apiPrefix ?? "/api/v1",
  });
}
