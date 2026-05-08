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
  experimental: {
    /** Tree-shaking précis pour react-icons (réduit fortement le JS de la landing). */
    optimizePackageImports: ["react-icons", "react-icons/md", "react-icons/fa", "react-icons/fa6"],
  },
  async headers() {
    const isProd = process.env.NODE_ENV === "production";
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // POS scanner requires camera access in same-origin top-level document.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-site" },
          ...(isProd
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" }]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
