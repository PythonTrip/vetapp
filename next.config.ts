import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Do not set `output: "standalone"` for Vercel — it is for Docker/self-hosting.
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
