import type { NextConfig } from "next";

// Proxy API/WS/static to the backend so the browser only ever talks to the
// frontend origin (same-origin). This makes the app work behind a single
// public tunnel (Cloudflare etc.) with no CORS / mixed-content / localhost issues.
// In compose set BACKEND_ORIGIN=http://backend:8000; on host dev it defaults to localhost.
const BACKEND = process.env.BACKEND_ORIGIN || "http://localhost:8000";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    domains: ["localhost"],
  },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${BACKEND}/api/:path*` },
      { source: "/static/:path*", destination: `${BACKEND}/static/:path*` },
      { source: "/ws/:path*", destination: `${BACKEND}/ws/:path*` },
    ];
  },
};

export default nextConfig;
