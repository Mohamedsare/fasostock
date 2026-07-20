import type { MetadataRoute } from "next";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

const seoRoutes = [
  "/offre-complete",
  "/logiciel-gestion-stock-burkina-faso",
  "/logiciel-caisse-ouagadougou",
  "/gestion-stock-afrique-ouest",
  "/logiciel-inventaire-pme-burkina",
  "/application-gestion-boutique-burkina",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: siteUrl,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...seoRoutes.map((path) => ({
      url: `${siteUrl}${path}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.85,
    })),
  ];
}
