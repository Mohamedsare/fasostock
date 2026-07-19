"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { fetchStoreCatalog } from "@/lib/features/stores/store-catalog";

/**
 * Catalogue autorisé pour une boutique.
 *
 * `catalog === null` => la boutique partage tout le catalogue de l'entreprise
 * (aucun filtrage à appliquer). Sinon `catalog` est l'ensemble des `product_id`
 * autorisés — utiliser `filterByStoreCatalog(products, catalog)`.
 */
export function useStoreCatalog(storeId: string | null) {
  const q = useQuery({
    queryKey: queryKeys.storeCatalog(storeId),
    queryFn: () => fetchStoreCatalog(storeId),
    enabled: !!storeId,
    staleTime: 30_000,
    // Reconstruit un vrai `Set` à partir de la donnée du cache (tableau/valeur
    // éventuellement corrompue par la sérialisation) — jamais un `Set` sérialisé.
    select: (data): Set<string> | null => {
      if (!data) return null;
      if (data instanceof Set) return data as Set<string>;
      return new Set(Array.isArray(data) ? (data as string[]) : []);
    },
  });
  return {
    catalog: q.data ?? null,
    isLoading: q.isLoading,
    isError: q.isError,
  };
}
