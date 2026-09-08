/** @type {import('next').NextConfig} */
const nextConfig = {
  // No rewrites. spx-ui serves only /api/spiderx-configuration and
  // /api/spiderx-endpoint; every application call goes straight from the
  // browser to spx-service on :8082. SpiderX has no uiServices-ndr dependency.
};

export default nextConfig;
