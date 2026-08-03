import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Emit a self-contained server bundle for the Docker `web` image.
  output: "standalone",
  // Native/binary deps that must not be webpack-bundled — they load platform
  // .node addons at runtime (resvg/sharp) or read font/wasm files (satori).
  // Next externalizes these for server components/route handlers.
  serverExternalPackages: [
    "@resvg/resvg-js",
    "sharp",
    "satori",
    "canvas",
    "bullmq"
  ],
  webpack: (config) => {
    config.externals = [...(config.externals || []), { canvas: "canvas" }];
    return config;
  },
  experimental: {
    // Server Actions body size limit for media metadata payloads
    serverActions: {
      bodySizeLimit: "200mb",
    },
  },
  images: {
    // Supabase Storage public bucket + Meta CDN hosts for previews
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "scontent.xx.fbcdn.net" },
      { protocol: "https", hostname: "*.cdninstagram.com" },
    ],
  },
};

export default nextConfig;
