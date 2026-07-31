import type { NextConfig } from "next";

/**
 * Content-Security-Policy — déployée en **Report-Only** : le navigateur signale
 * les violations dans la console sans rien bloquer. Objectif : mesurer l'impact
 * réel (AdSense, YouTube, Turnstile, tuiles de carte) avant de passer à une CSP
 * bloquante, en basculant simplement la clé sur `Content-Security-Policy`.
 *
 * Volontairement SANS nonce : la variante à nonce de Next impose le rendu
 * dynamique de toutes les pages (fin du statique, du cache CDN et du PPR), ce
 * qui dégraderait la landing et les pages SEO.
 */
function buildCspReportOnly(): string {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "") ?? "";
  const supabaseWs = supabase.replace(/^https:/, "wss:");
  const google = "https://*.googlesyndication.com https://*.doubleclick.net https://www.google.com";

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    // 'unsafe-inline' reste requis tant que le JSON-LD et les styles inline ne
    // sont pas portés par un nonce (cf. commentaire ci-dessus).
    `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com ${google}`,
    "style-src 'self' 'unsafe-inline'",
    // Images produits/logos : URLs publiques Supabase + tuiles de carte externes.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    [
      "connect-src 'self'",
      supabase,
      supabaseWs,
      google,
    ]
      .filter(Boolean)
      .join(" "),
    `frame-src 'self' https://challenges.cloudflare.com https://www.youtube-nocookie.com https://www.youtube.com ${google}`,
    ["media-src 'self' blob: data:", supabase].filter(Boolean).join(" "),
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

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
            ? [
                { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
                // Report-Only : n'a aucun effet bloquant (voir buildCspReportOnly).
                // Limité à la prod pour ne pas polluer la console en dev (HMR).
                { key: "Content-Security-Policy-Report-Only", value: buildCspReportOnly() },
              ]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
