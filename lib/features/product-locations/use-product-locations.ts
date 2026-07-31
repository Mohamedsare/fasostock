"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { fetchProductLocations } from "./api";
import type { ProductLocation } from "./types";

/**
 * Rangements de la boutique, indexés `product_id → emplacement`.
 *
 * La requête stocke un TABLEAU, jamais une `Map` : le cache React Query est
 * persisté, et une `Map` en ressort en objet nu (`.get is not a function`).
 * L'index est reconstruit dans `select`, qui tourne aussi sur la donnée du cache
 * — et qui reste tolérant à une entrée corrompue par une ancienne persistance.
 */
export function useProductLocationMap(storeId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.productLocations(storeId),
    queryFn: () => fetchProductLocations(storeId ?? ""),
    enabled: enabled && Boolean(storeId),
    staleTime: 5 * 60_000,
    select: (data): Map<string, ProductLocation> => {
      if (!Array.isArray(data)) return new Map();
      return new Map(data.map((r) => [r.productId, r]));
    },
  });
}
