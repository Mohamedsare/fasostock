"use client";

import { fetchPackagingPricePerPiece } from "@/lib/features/settings/packaging-price-mode";
import { queryKeys } from "@/lib/query/query-keys";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

/**
 * Mode de saisie du prix d'un conditionnement, pour un écran qui va l'accepter au
 * clavier.
 *
 * POURQUOI CE HOOK EXISTE
 *
 * Le même nombre tapé dans le même champ veut dire deux choses opposées selon le
 * réglage `packaging_price_per_piece_enabled` : « 2 500 » est soit le prix du carton
 * de 12, soit celui d'une pièce — donc 30 000 le carton. Un facteur 12 d'écart sur ce
 * que le commerçant croit avoir enregistré.
 *
 * Lu naïvement (`useQuery(...).data === true`), le réglage vaut `false` tant que la
 * réponse n'est pas là. Le champ s'ouvrait donc systématiquement sous le libellé
 * « Prix du lot entier », et pouvait basculer sur « Prix d'une pièce du lot » pendant
 * la frappe — ou pire, entre la frappe et le clic sur Créer : l'utilisateur saisit
 * 2 500 en pensant au carton, l'application en enregistre 30 000.
 *
 * Deux garanties, donc :
 *
 *  1. `ready` — tant que le mode n'est pas **certain**, l'écran doit refuser la
 *     saisie du prix. Pas de valeur par défaut : les deux défauts possibles sont
 *     faux la moitié du temps, et l'erreur est silencieuse.
 *  2. Le mode est **gelé** dès qu'il est connu, pour toute la durée de vie de
 *     l'écran. Le patron peut basculer le réglage depuis son bureau pendant que le
 *     vendeur remplit son formulaire : le sens du champ sous ses doigts, lui, ne
 *     changera pas. Le nouveau mode s'appliquera au formulaire suivant.
 *
 * `refetchOnMount: "always"` complète le tableau : le cache React Query est persisté
 * sur disque 7 jours (`RQ_MAX_AGE_MS`), donc sans relecture forcée un poste pourrait
 * geler un mode vieux d'une semaine. On confirme auprès du serveur à chaque ouverture,
 * et on ne gèle qu'ensuite.
 *
 * HORS LIGNE
 *
 * Si la relecture échoue mais qu'une valeur persistée existe, React Query conserve
 * cette valeur et on la gèle : le vendeur travaille avec le dernier mode connu, ce qui
 * est le bon pari (le réglage bouge une fois par an). Si aucune valeur n'a jamais été
 * lue sur ce poste, `ready` reste `false` et l'écran bloque le champ prix — mieux vaut
 * un conditionnement ajouté plus tard qu'un carton vendu douze fois trop cher.
 */
export type PackagingPriceMode = {
  /** `true` = le champ demande le prix d'UNE PIÈCE du lot ; `false` = le lot entier. */
  perPiece: boolean;
  /** `false` tant que le mode n'est pas certain : le champ prix doit rester bloqué. */
  ready: boolean;
};

export function usePackagingPriceMode(companyId: string): PackagingPriceMode {
  const q = useQuery({
    queryKey: queryKeys.packagingPricePerPiece(companyId),
    queryFn: () => fetchPackagingPricePerPiece(companyId),
    enabled: Boolean(companyId),
    staleTime: 0,
    refetchOnMount: "always",
  });

  /*
   * « Posée » = plus aucune requête en vol. On ne se contente pas de `isSuccess` :
   * avec une valeur restaurée du disque, la requête est déjà `success` alors que la
   * relecture est encore en route — on gèlerait la valeur d'hier.
   *
   * `isError` sans donnée laisse `resolved` à `null` : réseau injoignable et rien en
   * cache, le mode reste inconnu et l'écran doit le dire plutôt que d'en inventer un.
   */
  const settled = q.fetchStatus === "idle" && (q.isSuccess || q.isError);
  const resolved = settled && q.data !== undefined ? q.data === true : null;

  /*
   * Le gel, par ajustement d'état pendant le rendu — le patron que React documente
   * pour « recalculer quand une prop change » (https://react.dev/reference/react/useState).
   * La condition ne redevient vraie qu'au changement d'entreprise : une fois le mode
   * gelé, plus aucun `setState`, donc pas de rendu en cascade.
   */
  const [frozen, setFrozen] = useState<{ companyId: string; perPiece: boolean } | null>(
    null,
  );
  const current = frozen !== null && frozen.companyId === companyId ? frozen : null;
  if (current === null && resolved !== null) {
    setFrozen({ companyId, perPiece: resolved });
  }

  return { perPiece: current?.perPiece === true, ready: current !== null };
}
