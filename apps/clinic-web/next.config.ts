import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: process.env.DOCKER_BUILD === "1" ? "standalone" : undefined,
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  turbopack: { root: path.resolve(__dirname, "../..") },
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
