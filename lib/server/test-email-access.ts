/**
 * Route /api/test-email : désactivée en production Vercel par défaut.
 * Pour un test ponctuel en prod : ENABLE_TEST_EMAIL=1 (à retirer ensuite).
 */
export function isTestEmailRouteEnabled(): boolean {
  const explicit = process.env.ENABLE_TEST_EMAIL?.trim().toLowerCase();
  if (explicit === "1" || explicit === "true") return true;
  if (explicit === "0" || explicit === "false") return false;

  if (process.env.VERCEL_ENV === "production") return false;
  return process.env.NODE_ENV === "development";
}
