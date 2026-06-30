import type { NextConfig } from "next";

const javaApiBaseUrl = process.env.CONTROL3D_JAVA_API_BASE_URL ?? "http://localhost:8778";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["gltf-pipeline"],
  transpilePackages: ["@control3d/shared"],
  typedRoutes: true,
  experimental: {
    middlewareClientMaxBodySize: "200mb",
  },
  async rewrites() {
    if (!javaApiBaseUrl) {
      return {
        beforeFiles: [],
      };
    }

    return {
      beforeFiles: [
        {
          source: "/api/:path*",
          destination: `${javaApiBaseUrl}/api/:path*`,
        },
        {
          source: "/upload-files/:path*",
          destination: `${javaApiBaseUrl}/upload-files/:path*`,
        },
        {
          source: "/uploads/:path*",
          destination: `${javaApiBaseUrl}/uploads/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
