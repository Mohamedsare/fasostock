import type { CookieOptions } from "@supabase/ssr";

/**
 * Durée de vie des cookies de session : 400 jours, le maximum accepté par les navigateurs
 * (Chrome et Safari plafonnent `Max-Age` à 400 jours).
 *
 * Règle métier : un commerçant qui se connecte reste connecté jusqu'à ce qu'il appuie
 * lui-même sur « Se déconnecter ». Fermer l'onglet, éteindre le téléphone ou ne pas
 * ouvrir l'app pendant des semaines ne doit **jamais** le déconnecter.
 */
export const SESSION_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

/** Cookie de session Supabase (`sb-<ref>-auth-token`, éventuellement découpé en `.0`, `.1`…). */
export function isSupabaseAuthCookieName(name: string): boolean {
  return name.startsWith("sb-") && name.includes("-auth-token");
}

/** Cookie technique du flux PKCE — présent avant même toute connexion, donc non probant. */
function isCodeVerifierCookie(name: string): boolean {
  return name.includes("-code-verifier");
}

/**
 * Force la longue durée de vie sur les cookies d'authentification.
 *
 * Sans `maxAge`, un cookie est un *cookie de session* : il disparaît à la fermeture du
 * navigateur — exactement la déconnexion surprise qu'on veut supprimer. On ne touche pas
 * aux cookies de **suppression** (valeur vide) : ce sont eux qui matérialisent une vraie
 * déconnexion demandée par l'utilisateur.
 */
export function withLongLivedSession(
  name: string,
  value: string,
  options: CookieOptions,
): CookieOptions {
  // Le cookie technique PKCE, lui, doit rester éphémère.
  if (value === "" || !isSupabaseAuthCookieName(name) || isCodeVerifierCookie(name)) {
    return options;
  }
  // `expires` retiré : deux directives concurrentes sur le même cookie, autant n'en garder qu'une.
  const { expires: _ignored, ...rest } = options;
  return { ...rest, maxAge: SESSION_COOKIE_MAX_AGE_SECONDS };
}

/**
 * Y a-t-il une session stockée sur cet appareil ?
 *
 * Sert à distinguer « personne n'est connecté ici » (→ page de connexion) de
 * « connecté, mais impossible de vérifier maintenant » (→ on garde l'utilisateur dans l'app).
 */
export function hasStoredSessionCookie(all: { name: string; value?: string }[]): boolean {
  return all.some(
    (c) =>
      isSupabaseAuthCookieName(c.name) &&
      !isCodeVerifierCookie(c.name) &&
      (c.value ?? "") !== "",
  );
}
