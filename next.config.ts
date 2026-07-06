import type { NextConfig } from "next";

// Baseline security headers (SEC-7). Kept conservative so they don't interfere
// with the Facebook/TikTok OAuth popup flows (popups are separate windows, not
// frames of our pages). HSTS is scoped to this host only (no includeSubDomains /
// preload) to avoid breaking any non-HTTPS subdomain.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
