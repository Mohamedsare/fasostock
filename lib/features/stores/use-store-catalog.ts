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
  });
  return {
    catalog: q.data ?? null,
    isLoading: q.isLoading,
    isError: q.isError,
  };
}
