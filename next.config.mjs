import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { loadAppConfig } = require("./config/load-config.cjs");

/** Resolve the companion API base from spiderx.yml, with env taking precedence. */
function uiServiceUrl() {
  if (process.env.UISERVICE_URL) return process.env.UISERVICE_URL;
  try {
    return loadAppConfig()?.uiservice?.url || "http://127.0.0.1:8083";
  } catch {
    return "http://127.0.0.1:8083";
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // Fallback: paths SpiderX Next routes don't own can hit uiServices-ndr (:8083).
    // Next's own /api/v1/* route handlers always take precedence over rewrites.
    const backend = uiServiceUrl().replace(/\/$/, "");
    return {
      fallback: [
        {
          source: "/api/v1/dashboard/:path*",
          destination: `${backend}/api/v1/dashboard/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
