/** Routes API accessibles sans session (liste explicite — défense en profondeur). */
const PUBLIC_API_ROUTES: readonly string[] = [
  "/api/auth/forgot-password",
  "/api/newsletter/subscribe",
  "/api/ai/landing-chat",
];

const PUBLIC_API_PREFIXES: readonly string[] = ["/api/cron/"];

export function isPublicApiRoute(pathname: string): boolean {
  if (PUBLIC_API_ROUTES.includes(pathname)) return true;
  return PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
