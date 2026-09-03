import type { SupplyDraftLine } from "./types";

/**
 * Arrivage en cours de saisie (réassort rapide).
 *
 * Le commerçant décharge sa camionnette et saisit ligne à ligne, en allant souvent
 * vérifier un prix ou une fiche produit ailleurs dans l'app. Le routeur démonte alors la
 * page et la saisie repart de zéro.
 */
export type QuickSupplyDraft = {
  lines: SupplyDraftLine[];
  supplier: string;
  paidText: string;
  note: string;
  /**
   * Clé d'idempotence de l'arrivage, restaurée AVEC les lignes — c'est le point
   * important.
   *
   * Un brouillon ne subsiste que si la validation n'a pas abouti côté client : elle n'est
   * jamais partie, ou sa réponse s'est perdue. Ce second cas est le dangereux : le stock
   * est déjà entré en base. Rendre la même clé fait reconnaître le doublon au serveur et
   * n'entre la marchandise qu'une fois. En repartir avec une clé neuve entrerait le
   * chargement deux fois, écart qu'on ne découvrirait qu'à l'inventaire.
   */
  requestId: string;
};

/** Incrémenter à tout changement de forme : les brouillons d'avant sont alors ignorés. */
export const QUICK_SUPPLY_DRAFT_VERSION = 1;

/**
 * Une saisie par entreprise × boutique. Les lignes portent le stock et les prix d'UNE
 * boutique ; les mélanger ferait entrer la marchandise au mauvais endroit.
 */
export function quickSupplyDraftKey(companyId: string, storeId: string): string {
  return `quick-supply:${companyId}:${storeId}`;
}

/** Sans ligne il n'y a pas d'arrivage : fournisseur et note seuls ne valent rien. */
export function isQuickSupplyDraftEmpty(draft: QuickSupplyDraft): boolean {
  return draft.lines.length === 0;
}
