"use client";

/**
 * Impression automatique du ticket en caisse rapide.
 *
 * **Réglage d'APPAREIL** (comme `pos_remote_print_enabled`), et non d'entreprise : c'est
 * le poste branché à l'imprimante thermique qui doit imprimer tout seul. Le même compte
 * ouvert sur le téléphone du gérant ne doit pas se mettre à réclamer une imprimante qu'il
 * n'a pas — d'où `localStorage` plutôt qu'un réglage en base.
 *
 * Lu au moment de la vente, jamais depuis l'état React : la caisse reste souvent ouverte
 * dans deux onglets, et c'est le dernier réglage posé qui doit valoir, pas celui qu'un
 * onglet a mémorisé au chargement.
 */
export const QUICK_AUTO_PRINT_KEY = "pos_quick_auto_print";

export function readQuickAutoPrint(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(QUICK_AUTO_PRINT_KEY) === "true";
  } catch {
    // Navigation privée / stockage refusé : on retombe sur le dialogue ticket, qui ne
    // dépend d'aucun réglage. Un ticket de trop vaut mieux qu'un ticket manquant.
    return false;
  }
}

export function writeQuickAutoPrint(enabled: boolean): void {
  try {
    localStorage.setItem(QUICK_AUTO_PRINT_KEY, enabled ? "true" : "false");
  } catch {
    /* préférence non persistée : la caisse fonctionne, sans mémoire du réglage */
  }
}
