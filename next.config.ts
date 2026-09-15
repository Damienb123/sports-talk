import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  distDir: process.env.SPORTS_TALK_BROWSER_TEST === "1" ? ".next-browser" : ".next",
};

export default nextConfig;
