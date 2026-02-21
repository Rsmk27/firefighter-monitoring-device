import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false, // Prevent double-init of MapLibre GL WebGL context
};

export default nextConfig;
