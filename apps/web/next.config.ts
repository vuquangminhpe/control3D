import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["gltf-pipeline"],
  typedRoutes: true,
};

export default nextConfig;
