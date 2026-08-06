/**
 * URL canonique du site public.
 *
 * Une seule source pour tous les `canonical`, `openGraph.url`, JSON-LD,
 * `sitemap.xml` et `robots.txt` : un canonical qui pointe vers un autre hôte
 * que celui réellement servi (apex vs www) dilue le référencement.
 *
 * Le domaine servi est `www.fasostock.com` — c'est donc le repli par défaut.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://www.fasostock.com")
).replace(/\/$/, "");
