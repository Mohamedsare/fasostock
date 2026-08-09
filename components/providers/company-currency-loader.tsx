"use client";

import { useQuery } from "@tanstack/react-query";

import { useAppContext } from "@/lib/features/common/app-context";
import { fetchCompanyCurrency } from "@/lib/features/settings/company-currency";

/**
 * Charge la devise de l'entreprise et la rend active pour tout l'écran.
 *
 * Monté une seule fois dans la coque applicative : `fetchCompanyCurrency` renseigne
 * l'état de module lu par `formatCurrency`, ce qui évite de faire remonter la devise
 * jusqu'aux six cents et quelques endroits qui affichent un montant.
 *
 * Ne rend rien et n'affiche jamais d'erreur : si la lecture échoue (réseau), les
 * montants restent dans la devise par défaut. Un prix affiché en francs CFA le temps
 * d'un aller-retour vaut mieux qu'un écran de caisse bloqué.
 */
export function CompanyCurrencyLoader() {
  const ctx = useAppContext();
  const companyId = ctx.data?.companyId ?? "";

  useQuery({
    queryKey: ["company-currency", companyId],
    queryFn: () => fetchCompanyCurrency(companyId),
    enabled: companyId.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  return null;
}
