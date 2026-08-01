"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { listCompanyPartCompatibilities } from "./api";

/**
 * Compatibilités indexées `product_id → modèles`, pour la caisse.
 *
 * La requête stocke un TABLEAU, jamais une `Map` : le cache React Query est
 * persisté, et une `Map` en ressort en objet nu (`.get is not a function`).
 * L'index est reconstruit dans `select`, qui tourne aussi sur la donnée du cache.
 */
export function usePartCompatibilityMap(companyId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.partCompatibilities(companyId),
    queryFn: () => listCompanyPartCompatibilities(companyId),
    enabled: enabled && Boolean(companyId),
    staleTime: 5 * 60_000,
    select: (data): Map<string, string[]> => {
      const map = new Map<string, string[]>();
      if (!Array.isArray(data)) return map;
      for (const row of data) {
        const list = map.get(row.productId);
        if (list) list.push(row.label);
        else map.set(row.productId, [row.label]);
      }
      for (const list of map.values()) list.sort((a, b) => a.localeCompare(b, "fr"));
      return map;
    },
  });
}
