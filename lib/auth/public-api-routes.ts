/** Routes API accessibles sans session (liste explicite — défense en profondeur). */
const PUBLIC_API_ROUTES: readonly string[] = [
  "/api/auth/forgot-password",
  "/api/newsletter/subscribe",
  "/api/ai/landing-chat",
  /** Présence : les visiteurs anonymes du site public doivent pouvoir être comptés. */
  "/api/presence/heartbeat",
];

const PUBLIC_API_PREFIXES: readonly string[] = [
  "/api/cron/",
  /** API publique produits : authentifiée par clé API (`lib/server/public-api/v1.ts`), pas par session. */
  "/api/v1/",
];

export function isPublicApiRoute(pathname: string): boolean {
  if (PUBLIC_API_ROUTES.includes(pathname)) return true;
  return PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
