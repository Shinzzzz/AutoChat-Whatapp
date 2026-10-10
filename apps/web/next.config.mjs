/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages are shipped as TypeScript source; let Next transpile them.
  transpilePackages: [
    "@autochat/core",
    "@autochat/db",
    "@autochat/ui",
    "@autochat/ai",
    "@autochat/channels",
    "@autochat/commerce",
    "@autochat/engine",
  ],
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  // Prisma, ioredis, bullmq and the Anthropic SDK are server-only native-ish deps.
  serverExternalPackages: ["@prisma/client", "ioredis", "bullmq", "@anthropic-ai/sdk", "pdfkit"],
  // Our source uses Node-ESM-style ".js" import specifiers that point at ".ts"
  // files (so the worker/tsx can run the same code). Teach webpack to resolve them.
  webpack(config) {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
