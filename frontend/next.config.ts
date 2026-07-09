import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["http://172.18.0.1:3000"],
  experimental: {
    devtoolSegmentExplorer: false,
  },
  reactStrictMode: true,
};

export default nextConfig;
