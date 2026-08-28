import { cookies } from "next/headers";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { hasStoredSessionCookie } from "@/lib/supabase/auth-cookies";

/**
 * Verdict d'authentification côté serveur.
 *
 * — `signed-in`   : session valide, utilisateur connu ;
 * — `signed-out`  : **certitude** qu'il n'y a plus de session (pas de cookie, ou jeton
 *                   explicitement refusé) → page de connexion ;
 * — `unverified`  : une session existe sur l'appareil mais on n'a pas pu la vérifier
 *                   (Supabase injoignable, réseau coupé, délai dépassé). Surtout **ne pas**
 *                   renvoyer au login : l'utilisateur est très probablement encore connecté,
 *                   et les gardes côté client savent se rétablir toutes seules.
 */
export type ServerSession =
  | { status: "signed-in"; user: User }
  | { status: "signed-out" }
  | { status: "unverified" };

/**
 * Panne passagère (réseau / serveur) plutôt que refus d'authentification.
 * Pendant du `isTransientAuthFailure` client (`lib/features/common/app-context.ts`).
 */
export function isTransientBackendFailure(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof TypeError) return true;

  const name = (err as { name?: string }).name ?? "";
  if (name === "AuthRetryableFetchError" || name === "AbortError") return true;

  /*
   * Verrou d'authentification du SDK volé par un appel concurrent : la session est
   * intacte, seul l'accès au jeton a échoué. Le pendant client détaille le mécanisme
   * (`isTransientAuthFailure`, app-context.ts). Ici la contention est plus rare — un
   * rendu serveur n'a qu'un client à la fois — mais le verdict doit rester le même des
   * deux côtés, sinon le proxy renvoie au login ce que le client sait rattraper.
   */
  if ((err as { isAcquireTimeout?: boolean }).isAcquireTimeout === true) return true;
  if (
    name === "NavigatorLockAcquireTimeoutError" ||
    name === "ProcessLockAcquireTimeoutError" ||
    name === "LockAcquireTimeoutError"
  ) {
    return true;
  }

  const status = (err as { status?: number }).status;
  if (
    typeof status === "number" &&
    (status === 0 || status === 408 || status === 429 || status >= 500)
  ) {
    return true;
  }

  const msg = String((err as { message?: string }).message ?? err).toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("load failed") ||
    msg.includes("fetch failed") ||
    msg.includes("timeout") ||
    msg.includes("aborted") ||
    msg.includes("another request stole it") ||
    msg.includes("lockmanager")
  );
}

/**
 * Plafond sur l'appel d'auth : un Supabase qui pend ne doit pas figer le rendu de la page.
 * Au-delà, on répond `unverified` — l'app s'affiche et se rétablit côté client.
 */
const AUTH_TIMEOUT_MS = 8000;

async function withTimeout<T>(p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("auth-timeout")), AUTH_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Résout la session pour un layout / une page serveur, **sans jamais déconnecter par erreur**.
 *
 * Règle métier : on ne renvoie au login que si l'on est sûr qu'il n'y a plus de session.
 * Une coupure réseau, un Supabase lent ou un incident d'hébergeur ne doivent pas éjecter
 * un commerçant en pleine vente.
 */
export async function resolveServerSession(
  supabase: SupabaseClient,
): Promise<ServerSession> {
  const stored = hasStoredSessionCookie((await cookies()).getAll());
  if (!stored) return { status: "signed-out" };

  try {
    const { data, error } = await withTimeout(supabase.auth.getUser());
    if (data?.user) return { status: "signed-in", user: data.user };
    if (isTransientBackendFailure(error)) return { status: "unverified" };
    // Jeton présent mais explicitement refusé (session révoquée, mot de passe changé…).
    return { status: "signed-out" };
  } catch {
    // `getUser()` ne lève que sur incident réseau / délai dépassé : indécidable.
    return { status: "unverified" };
  }
}
