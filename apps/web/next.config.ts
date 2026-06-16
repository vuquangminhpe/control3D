import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["gltf-pipeline"],
  transpilePackages: ["@control3d/shared"],
  typedRoutes: true,
};

export default nextConfig;
