import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@web-analytics/ingest"],
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default config;
