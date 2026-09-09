import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // ADR 0002: local-dev-only fixture tiles. pmtiles issues HTTP Range
        // requests; disable caching here so the browser never serves a
        // range read from a stale/partial cached copy of a large binary
        // file that changes across `npm run generate:fixtures` runs.
        source: "/dev-tiles/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
