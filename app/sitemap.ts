import type { MetadataRoute } from "next";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

const indexedRoutes = [
  "",
  "/login",
  "/register",
  "/register/select-activity",
  "/forgot-password",
  "/reset-password",
  "/setup",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return indexedRoutes.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: now,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.7,
  }));
}
