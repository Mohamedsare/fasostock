"use client";

import type { QueryClient } from "@tanstack/react-query";
import type { AppContextData } from "@/lib/features/permissions/access";
import { queryKeys } from "@/lib/query/query-keys";

/** Clé de la préférence « boutique active » — partagée avec `app-context`. */
export const ACTIVE_STORE_STORAGE_KEY = "fs_active_store_id";

/** Valeur stockée pour « toutes les boutiques » (contexte : `storeId = null`). */
export const ALL_STORES_VALUE = "__all__";

/**
 * Change la boutique active pour TOUTE l'application.
 *
 * Quatre endroits proposent ce choix (barre supérieure, Paramètres, Tableau de
 * bord, Rapports). Ils passent tous par ici, sinon leurs comportements divergent :
 * l'un rafraîchit le stock, l'autre non.
 *
 * L'ordre compte :
 *
 *  1. `localStorage` — c'est la source que relit `app-context` au prochain chargement.
 *  2. Le cache du contexte, **de façon synchrone**. `storeId` n'est qu'une préférence
 *     locale : la poser à la main est exact, pas une supposition. Sans cela, les
 *     requêtes relancées à l'étape 3 repartiraient avec l'ancienne boutique, et
 *     celles dont la clé ne contient pas le `storeId` conserveraient ce résultat périmé.
 *  3. Le reste du cache — catalogue, stock, prix, promotions, historiques. On épargne
 *     `app-context`, qu'on vient de poser.
 *
 * Ne remonte pas l'écran courant : c'est à l'appelant de le faire s'il le faut
 * (voir `storeEpoch` dans `AppShell`).
 */
export function applyActiveStoreChange(
  queryClient: QueryClient,
  storeId: string | null,
): void {
  try {
    localStorage.setItem(ACTIVE_STORE_STORAGE_KEY, storeId ?? ALL_STORES_VALUE);
  } catch {
    /* mode privé / quota : la préférence ne survivra pas au rechargement, tant pis */
  }

  queryClient.setQueryData<AppContextData | null>(queryKeys.appContext, (prev) =>
    prev ? { ...prev, storeId } : prev,
  );

  void queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[0] !== queryKeys.appContext[0],
  });
}
