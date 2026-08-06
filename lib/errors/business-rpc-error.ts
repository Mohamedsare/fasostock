import { UserFriendlyError } from "./app-error-mapper";

/**
 * SQLSTATE d'un `RAISE EXCEPTION` sans ERRCODE dans nos fonctions PL/pgSQL :
 * ce sont nos messages métier, écrits en français pour le caissier
 * (« Épargne insuffisante… », « Ce lot est déjà occupé… »).
 */
const PLPGSQL_RAISE = "P0001";

/**
 * Erreur d'un RPC Supabase transformée en erreur affichable.
 *
 * Seuls les messages que **nous** avons écrits (`RAISE EXCEPTION`, SQLSTATE
 * P0001) sont marqués `UserFriendlyError`, donc montrés tels quels au caissier.
 *
 * Tout le reste — erreur interne Postgres (`column reference "x" is ambiguous`,
 * violation de contrainte…), RLS, réseau — est renvoyé en `Error` ordinaire :
 * `toUserMessage` le fait alors passer par ses règles habituelles (pas
 * d'autorisation, session expirée, connexion indisponible…) et, à défaut,
 * affiche le message de repli. Le texte technique sert au journal, jamais à
 * l'écran.
 */
export function businessRpcError(
  error: { message?: string; code?: string } | null,
  fallback: string,
): Error {
  const msg = String(error?.message ?? "").trim();
  const code = String(error?.code ?? "").trim();

  if (code === PLPGSQL_RAISE && msg.length > 0) {
    return new UserFriendlyError(msg);
  }
  if (msg.length === 0) return new UserFriendlyError(fallback);

  const technical = new Error(msg);
  technical.cause = error;
  return technical;
}
