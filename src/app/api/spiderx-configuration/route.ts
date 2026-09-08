import fs from "fs";
import { getAppConfig } from "@/lib/app-config";
import { encryptJSON } from "@/utils/cryptoUtils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * spx-ui owns spiderx.yml; spx-service pulls it from here at startup and every
 * two minutes. Same contract as vehere-ui's /api/ui-configuration: the body is
 * AES-encrypted with a key derived from the caller's X-Meta-Time, and the IV
 * comes back in X-Meta-IV.
 */
export async function GET(req: Request) {
  try {
    const localConfig = getAppConfig();

    let setupConfig: unknown = null;
    const setupPath = localConfig.filePath?.setupInfoFilePath || "/usr/local/etc/setup_info.json";
    try {
      if (fs.existsSync(setupPath)) {
        setupConfig = JSON.parse(fs.readFileSync(setupPath, "utf8"));
      }
    } catch {
      setupConfig = null;
    }

    const ts =
      req.headers.get("X-Meta-Time") ||
      req.headers.get("x-meta-time") ||
      String(Math.floor(Date.now() / 1000));

    const resp = encryptJSON({ localConfig, setupConfig }, ts);

    return new Response(JSON.stringify({ data: resp.data }), {
      status: 200,
      headers: new Headers({ "X-Meta-Time": ts, "X-Meta-IV": resp.iv }),
    });
  } catch {
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}
