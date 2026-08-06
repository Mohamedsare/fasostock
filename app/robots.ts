import { SITE_URL } from "@/lib/seo/site-url";
import type { MetadataRoute } from "next";

const siteUrl = SITE_URL;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/login",
          "/register",
          "/forgot-password",
          "/reset-password",
          "/setup",
          "/dashboard",
          "/admin",
          "/conditions-utilisation",
          "/politique-confidentialite",
          "/mentions-legales",
          "/politique-remboursement",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
