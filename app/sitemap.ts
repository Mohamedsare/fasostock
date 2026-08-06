import { SEO_LANDING_LINKS } from "@/lib/seo/landing-links";
import { SITE_URL } from "@/lib/seo/site-url";
import type { MetadataRoute } from "next";

const siteUrl = SITE_URL;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: siteUrl,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    // Pages SEO indexables — source unique partagée avec le maillage interne.
    ...SEO_LANDING_LINKS.map((l) => ({
      url: `${siteUrl}${l.href}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: l.priority,
    })),
  ];
}
