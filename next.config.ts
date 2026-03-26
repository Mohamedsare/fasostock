import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
  /**
   * Sans ceci, le trace Next.js n’embarque pas `node_modules/@sparticuz/chromium/bin/*.br`
   * (non référencés par import) → sur Vercel : « The input directory …/chromium/bin does not exist ».
   * Les clés suivent le chemin App Router normalisé (ex. `app/api/.../route` → `/app/api/...`).
   */
  outputFileTracingIncludes: {
    "/app/api/pdf/**": ["./node_modules/@sparticuz/chromium/**/*"],
  },
  /** Build Vercel : échouer si le typage bloque (détection précoce). */
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
