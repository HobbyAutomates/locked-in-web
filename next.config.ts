import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: { root: path.resolve(__dirname) },
  // v2.3: progress photos go through a Server Action as base64 (<= 1024 px JPEG, well under 4 MB).
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // v2.10: beta usage events kill switch, inlined for the browser tracker too. Default on; set
  // BETA_ANALYTICS=false and redeploy to stop sending (docs/ADMIN.md).
  env: { BETA_ANALYTICS: process.env.BETA_ANALYTICS ?? "true" },
};

export default nextConfig;
