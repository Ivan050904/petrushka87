import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js 15 blocks /_next/* from non-localhost origins unless listed here.
  // Required for phone/tablet testing via LAN IP (npm run dev:lan).
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "172.18.0.1",
    "192.168.56.1",
    "192.168.1.142",
    "10.0.85.2",
    "192.168.*",
    "10.*",
  ],
  experimental: {
    devtoolSegmentExplorer: false,
  },
  reactStrictMode: true,
};

export default nextConfig;
