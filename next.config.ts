import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["puppeteer"],
  /** Build Vercel : échouer si le typage bloque (détection précoce). */
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
