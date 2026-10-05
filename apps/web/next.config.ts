import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const config: NextConfig = {
  transpilePackages: ["@al/domain", "@al/db", "@al/pdf-review"],
  poweredByHeader: false,
  experimental: {
    // A version upload carries a DOCX and a PDF of up to 30MB each, plus multipart overhead.
    serverActions: { bodySizeLimit: "62mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
