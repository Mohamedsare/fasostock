/**
 * Un seul juge, pour les deux côtés : « cette erreur prouve-t-elle que la session est
 * perdue ? »
 *
 * POURQUOI CE FICHIER EXISTE
 *
 * Jusqu'ici, client et serveur décidaient chacun avec leur propre liste de pannes
 * *connues* (`isTransientAuthFailure`, `isTransientBackendFailure`), et tout ce qui
 * n'y figurait pas basculait du côté « déconnecté ». Le défaut était donc :
 * **erreur inconnue = on éjecte**. C'est l'inverse de la règle produit — une session
 * ne se termine que si l'utilisateur appuie sur « Se déconnecter ».
 *
 * Le coût a été payé en vrai : un `NavigatorLockAcquireTimeoutError` du SDK Supabase
 * (« Lock … was released because another request stole it »), qui n'est même pas une
 * erreur d'authentification, tombait par défaut du mauvais côté et affichait « Votre
 * session a expiré » à des caissiers en pleine vente, panier perdu. On pouvait ajouter
 * ce libellé à la liste — c'est fait — mais le prochain SDK en inventera un autre.
 *
 * D'où l'inversion : ce n'est plus à la panne de se faire reconnaître comme
 * passagère, c'est au **refus** de se faire reconnaître comme certain. Tout le reste
 * est un incident, et un incident laisse l'utilisateur dans son écran.
 *
 * CE QUI COMPTE COMME REFUS CERTAIN
 *
 * Uniquement une réponse d'authentification de Supabase qui dit explicitement non :
 * `AuthSessionMissingError` (aucune session), ou une `AuthError` en 401/403 — jeton
 * illisible, session révoquée, utilisateur supprimé ou banni. Rien d'autre. Une
 * coupure réseau, un 500, un délai dépassé, un verrou volé, une erreur jamais vue :
 * indécidable, donc on garde l'utilisateur.
 *
 * Le risque assumé de ce choix : quelqu'un dont la session est réellement morte peut
 * rester quelques secondes de plus devant un écran « Connexion impossible » avant que
 * la tentative suivante ne reçoive un vrai 401. C'est sans commune mesure avec une
 * vente perdue.
 */

/** Codes d'erreur Supabase qui désignent sans ambiguïté une session inutilisable. */
const DEFINITE_AUTH_CODES = new Set([
  "bad_jwt",
  "session_not_found",
  "session_expired",
  "user_not_found",
  "user_banned",
]);

export function isDefiniteAuthRejection(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;

  const e = err as {
    name?: string;
    status?: number;
    code?: string;
    __isAuthError?: boolean;
  };

  /* `getUser()` / `getSession()` sans aucune session en mémoire ni en cookie. */
  if (e.name === "AuthSessionMissingError") return true;

  /*
   * `__isAuthError` est le marqueur que pose `@supabase/auth-js` sur ses propres
   * erreurs. Sans lui, l'erreur ne vient pas du service d'authentification : elle ne
   * peut donc rien prouver sur la validité de la session.
   */
  if (e.__isAuthError !== true && e.name !== "AuthApiError") return false;

  /*
   * Une erreur d'auth *retryable* est un incident réseau déguisé — le SDK la lève
   * quand il n'a pas pu joindre le serveur. Elle ne prouve rien.
   */
  if (e.name === "AuthRetryableFetchError") return false;

  if (e.status === 401 || e.status === 403) return true;

  return DEFINITE_AUTH_CODES.has(String(e.code ?? "").toLowerCase());
}
