import type { RestockAdvice } from "./types";

/**
 * Préparation de réassort en cours.
 *
 * Le gérant passe en revue des dizaines de références, corrige les quantités une à une,
 * et fait souvent un aller-retour vers la fiche d'un produit ou l'historique d'achat
 * avant de trancher. Le routeur démonte alors la page et tout le travail d'arbitrage
 * repart de zéro.
 *
 * L'avis de l'IA compte double : il a coûté un appel facturé et plusieurs secondes
 * d'attente. Le reperdre parce qu'on est allé vérifier un prix est le cas que ce
 * brouillon évite en premier.
 */
export type RestockDraft = {
  /**
   * Période d'analyse et couverture visée. Elles font partie du brouillon parce que
   * TOUT le reste en dépend : des quantités corrigées pour 30 jours n'ont aucun sens
   * en face d'un sélecteur affichant 60. L'écran lui-même remet d'ailleurs le calcul à
   * zéro quand on en change.
   */
  days: number;
  coverDays: number;
  /** Références cochées pour la commande (un `Set` ne survit pas à JSON). */
  selected: string[];
  /** Quantités corrigées à la main ou par l'IA, par produit. */
  qtyOverrides: Record<string, number>;
  advice: RestockAdvice | null;
};

/** Incrémenter à tout changement de forme : les brouillons d'avant sont alors ignorés. */
export const RESTOCK_DRAFT_VERSION = 1;

/** `null` = vue « toutes boutiques » : elle a sa propre préparation, distincte de chaque magasin. */
export function restockDraftKey(companyId: string, storeId: string | null): string {
  return `restock:${companyId}:${storeId ?? "__all__"}`;
}

/**
 * Une période changée sans rien décider n'est pas du travail : seuls les arbitrages
 * (cases cochées, quantités corrigées) et l'avis de l'IA méritent d'être gardés.
 */
export function isRestockDraftEmpty(draft: RestockDraft): boolean {
  return (
    draft.selected.length === 0 &&
    Object.keys(draft.qtyOverrides).length === 0 &&
    draft.advice === null
  );
}
