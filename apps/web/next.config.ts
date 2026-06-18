import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["gltf-pipeline"],
  transpilePackages: ["@control3d/shared"],
  typedRoutes: true,
};

export default nextConfig;
