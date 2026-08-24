"use client";

import { useQuery } from "@tanstack/react-query";

import { useAppContext } from "@/lib/features/common/app-context";
import { fetchCompanyTimeZone } from "@/lib/features/settings/company-timezone";

/**
 * Charge le fuseau horaire de l'entreprise et le rend actif pour tout l'écran.
 *
 * Monté une seule fois dans la coque applicative, à côté de `CompanyCurrencyLoader` et
 * pour la même raison : `fetchCompanyTimeZone` renseigne l'état de module lu par les
 * helpers `operation-datetime`, ce qui évite de faire descendre le fuseau jusqu'à
 * chaque écran qui affiche une heure.
 *
 * Ne rend rien et n'affiche jamais d'erreur : si la lecture échoue (réseau), l'heure
 * reste au fuseau par défaut. Un ticket à l'heure d'Ouagadougou le temps d'un
 * aller-retour vaut mieux qu'une caisse bloquée.
 */
export function CompanyTimeZoneLoader() {
  const ctx = useAppContext();
  const companyId = ctx.data?.companyId ?? "";

  useQuery({
    queryKey: ["company-timezone", companyId],
    queryFn: () => fetchCompanyTimeZone(companyId),
    enabled: companyId.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  return null;
}
