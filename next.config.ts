import { withWorkflow } from "workflow/next";
import type { NextConfig } from "next";

// Keep native libraries for the build host only; deployment builds run on their target OS.
// An explicit target is for offline trace verification, not for serving on a different OS.
const inferenceTarget = process.env.SCOUT_ACCOUNT_BUILD_TARGET || `${process.platform}-${process.arch}`;
const supportedTargets = ['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64', 'win32-x64', 'win32-arm64'];
if (!supportedTargets.includes(inferenceTarget)) throw new Error('Unsupported Scout inference build target.');
const nativeExcludes = supportedTargets.filter(target => target !== inferenceTarget).flatMap(target => {
  const split = target.lastIndexOf('-');
  const platform = target.slice(0, split), arch = target.slice(split + 1);
  return [
    `./node_modules/onnxruntime-node/bin/napi-v3/${platform}/${arch}/**/*`,
    `./node_modules/**/@img/sharp-${target}/**/*`,
    `./node_modules/**/@img/sharp-libvips-${target}/**/*`,
  ];
});
const inferenceRoutes = ['/.well-known/workflow/v1/flow', '/api/sport-hub/scout', '/api/sport-hub/scout/reassess'];
const modelFiles = ['manifest.json', 'config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'onnx/model_quantized.onnx'].map(file => `./models/scout-account/${file}`);
// Scout uses CPU inference. Linux installs can otherwise fetch CUDA/TensorRT libraries
// and every route importing Scout would become an oversized, isolated function.
const cpuOnlyExcludes = [
  './node_modules/onnxruntime-node/bin/napi-v3/linux/*/libonnxruntime_providers_cuda.so',
  './node_modules/onnxruntime-node/bin/napi-v3/linux/*/libonnxruntime_providers_tensorrt.so',
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Emit a self-contained server bundle for the Docker `web` image when requested.
  output: process.env.BUILD_STANDALONE === "true" ? "standalone" : undefined,
  // Native/binary deps that must not be webpack-bundled — they load platform
  // .node addons at runtime (resvg/sharp) or read font/wasm files (satori).
  // Next externalizes these for server components/route handlers.
  serverExternalPackages: [
    "@resvg/resvg-js",
    "sharp",
    "satori",
    "canvas",
    "bullmq",
    "playwright",
    "@huggingface/transformers",
    "onnxruntime-node"
  ],
  // Local immutable model artifacts are included only in Node inference functions.
  outputFileTracingIncludes: Object.fromEntries(inferenceRoutes.map(route => [route, modelFiles])),
  outputFileTracingExcludes: { '/**': [...nativeExcludes, ...cpuOnlyExcludes] },
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

export default withWorkflow(nextConfig);
