"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isNetworkErrorPublic } from "@/lib/errors/app-error-mapper";

/**
 * Panne réseau côté authentification.
 *
 * `auth-js` emballe toute défaillance de transport dans `AuthRetryableFetchError`, dont
 * le message dépend du navigateur (« Failed to fetch » sur Chrome, « NetworkError… » sur
 * Firefox, « Load failed » sur Safari). On teste donc la classe en plus du texte, sinon
 * Safari passerait au travers.
 */
function isAuthNetworkFailure(error: unknown): boolean {
  if (isNetworkErrorPublic(error)) return true;
  const name = (error as { name?: unknown } | null)?.name;
  return String(name ?? "") === "AuthRetryableFetchError";
}

export type SaleAuthor =
  /** Identité confirmée par le serveur : la vente peut partir directement. */
  | { ok: true; verified: true; userId: string }
  /** Serveur injoignable : la vente doit être mise en file. `userId` au mieux. */
  | { ok: true; verified: false; userId: string | null }
  /** Refus d'authentification explicite : ni vente, ni mise en file. */
  | { ok: false; error: Error };

/**
 * Identifie le vendeur **sans jamais dépendre du réseau pour encaisser**.
 *
 * Deux pièges corrigés ici :
 *
 * 1. `supabase.auth.getUser()` interroge toujours le serveur (`GET /auth/v1/user`).
 *    Placé en tête d'un encaissement, il faisait échouer la vente hors ligne avant même
 *    d'atteindre la mise en file — le repli offline était du code mort.
 *
 * 2. Se rabattre sur `getSession()` ne suffisait pas : au-delà de l'expiration du jeton
 *    (1 h par défaut), cette fonction tente un rafraîchissement, qui échoue sans réseau.
 *    La caisse se serait donc bloquée après une heure de coupure.
 *
 * D'où ce choix : hors ligne, l'identité n'est pas nécessaire pour **mettre en file**.
 * Les handlers de synchronisation redemandent l'utilisateur au serveur au moment de
 * l'envoi (`requireUserId`), et la RLS tranche à ce moment-là. Une session absente ne
 * peut donc pas servir à écrire quoi que ce soit : le contrôle a lieu à l'arrivée, pas
 * au départ. On tente quand même une attribution locale, utile mais jamais bloquante.
 */
export async function resolveSaleAuthor(supabase: SupabaseClient): Promise<SaleAuthor> {
  let networkDown = false;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data?.user?.id) {
      return { ok: true, verified: true, userId: data.user.id };
    }
    // Refus franc (session révoquée, JWT invalide…) : ne pas le masquer en mise en file.
    if (error && !isAuthNetworkFailure(error)) {
      return { ok: false, error: error as Error };
    }
    networkDown = Boolean(error);
  } catch (e) {
    if (!isAuthNetworkFailure(e)) {
      return { ok: false, error: e instanceof Error ? e : new Error(String(e)) };
    }
    networkDown = true;
  }

  if (!networkDown) {
    // `getUser()` n'a ni répondu ni échoué franchement : traiter comme hors ligne
    // plutôt que refuser un encaissement.
    networkDown = true;
  }

  // Attribution locale au mieux — le jeton peut être périmé, ce n'est pas bloquant.
  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    userId = data?.session?.user?.id ?? null;
  } catch {
    userId = null;
  }

  return { ok: true, verified: false, userId };
}
