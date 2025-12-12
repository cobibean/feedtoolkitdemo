import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Handle external packages that don't work well with bundling
  serverExternalPackages: ['pino', 'pino-pretty', 'thread-stream'],
  
  // Required for Next.js 16 with Turbopack
  turbopack: {
    // Set root to frontend directory to avoid lockfile warning
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
