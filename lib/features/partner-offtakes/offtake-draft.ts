import type { OfftakeDraftLine } from "./types";

/**
 * Enlèvement partenaire en cours de saisie.
 *
 * Le partenaire charge sa marchandise pendant que le commerçant saisit, et celui-ci fait
 * régulièrement un aller-retour vers le stock ou l'historique du même partenaire. Le
 * routeur démonte la page à chaque fois.
 */
export type PartnerOfftakeDraft = {
  lines: OfftakeDraftLine[];
  partnerName: string;
  partnerPhone: string;
  paidText: string;
  dueAt: string;
  note: string;
  /**
   * Clé d'idempotence de l'enlèvement, restaurée AVEC les lignes — c'est le point
   * important.
   *
   * Un brouillon ne subsiste que si la validation n'a pas abouti côté client : elle n'est
   * jamais partie, ou sa réponse s'est perdue. Ce second cas est le dangereux : le stock
   * est déjà sorti en base. Rendre la même clé fait reconnaître le doublon au serveur et
   * ne sort la marchandise qu'une fois. En repartir avec une clé neuve la sortirait deux
   * fois, écart qu'on ne découvrirait qu'à l'inventaire.
   */
  requestId: string;
};

/** Incrémenter à tout changement de forme : les brouillons d'avant sont alors ignorés. */
export const PARTNER_OFFTAKE_DRAFT_VERSION = 1;

/**
 * Une saisie par entreprise × boutique. Les lignes portent le stock et les prix d'UNE
 * boutique ; les mélanger sortirait la marchandise du mauvais magasin.
 */
export function partnerOfftakeDraftKey(companyId: string, storeId: string): string {
  return `partner-offtake:${companyId}:${storeId}`;
}

/** Sans ligne il n'y a pas d'enlèvement : le nom du partenaire seul ne vaut rien. */
export function isPartnerOfftakeDraftEmpty(draft: PartnerOfftakeDraft): boolean {
  return draft.lines.length === 0;
}
