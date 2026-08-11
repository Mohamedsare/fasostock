/**
 * Suivi de retrait — « payé, mais pas encore emporté ».
 *
 * Le client choisit, paie, puis repart sans la marchandise : il revient ce soir, samedi,
 * avec le taxi. La vente, elle, est **complétée** — l'argent est encaissé, elle compte
 * dans la caisse du jour et dans le chiffre d'affaires. Ce qui manque n'est pas un statut
 * de vente : c'est la réponse à « qu'est-ce qui attend derrière le comptoir, à qui, et
 * depuis quand ». Voir migration 00188 pour le raisonnement complet.
 *
 * Le stock n'est PAS concerné : il a été décrémenté à l'encaissement et doit le rester,
 * sinon la marchandise redevient vendable et se vend deux fois.
 */

import type { SaleDeliveryState, SaleItem } from "./types";

export type SaleDelivery = {
  state: SaleDeliveryState;
  /** Vrai si la marchandise attend en boutique (vente complétée uniquement). */
  awaiting: boolean;
  /** Jours entiers d'attente, `null` si la date de mise en attente est inconnue. */
  waitingDays: number | null;
  /** Date promise au client (`YYYY-MM-DD`), ou `null`. */
  dueAt: string | null;
  /** Date promise dépassée — le client aurait dû venir. */
  overdue: boolean;
  note: string | null;
};

function daysBetween(fromIso: string, now: Date): number | null {
  const d = new Date(fromIso);
  if (Number.isNaN(d.getTime())) return null;
  const ms = now.getTime() - d.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/**
 * Lecture du suivi de retrait d'une vente.
 *
 * Deux garde-fous volontaires :
 *  • colonne absente (base non migrée) ⇒ « remise », l'écran fonctionne comme avant ;
 *  • vente non complétée (annulée, brouillon) ⇒ jamais « en attente » : une vente annulée
 *    a rendu son stock, il n'y a plus rien à remettre à personne.
 */
export function saleDelivery(sale: SaleItem, now: Date = new Date()): SaleDelivery {
  const raw = sale.delivery_state === "pending" ? "pending" : "delivered";
  const awaiting = raw === "pending" && sale.status === "completed";
  const dueAt = sale.delivery_due_at?.trim() || null;
  return {
    state: raw,
    awaiting,
    waitingDays:
      awaiting && sale.delivery_marked_at
        ? daysBetween(sale.delivery_marked_at, now)
        : null,
    dueAt,
    // Comparaison de dates locales `YYYY-MM-DD` : le jour promis lui-même n'est pas en
    // retard — on ne harcèle pas un client le matin du jour dit.
    overdue: Boolean(awaiting && dueAt && dueAt < toLocalYmd(now)),
    note: sale.delivery_note?.trim() || null,
  };
}

function toLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isAwaitingPickup(sale: SaleItem, now: Date = new Date()): boolean {
  return saleDelivery(sale, now).awaiting;
}

/** Nombre de ventes dont la marchandise attend encore en boutique. */
export function countAwaitingPickup(sales: SaleItem[], now: Date = new Date()): number {
  let n = 0;
  for (const s of sales) if (isAwaitingPickup(s, now)) n += 1;
  return n;
}

/** Libellé court pour la puce de liste : « À retirer », « À retirer · 3 j »… */
export function deliveryChipLabel(d: SaleDelivery): string {
  if (!d.awaiting) return "Remis";
  if (d.overdue) return "En retard";
  if (d.waitingDays !== null && d.waitingDays >= 1) {
    return `À retirer · ${d.waitingDays} j`;
  }
  return "À retirer";
}

/** Phrase complète pour l'infobulle / le détail — dit tout ce qu'on sait de l'attente. */
export function deliveryTooltip(d: SaleDelivery, dueLabel?: string | null): string {
  if (!d.awaiting) return "Marchandise remise au client";
  const parts = ["Payée — marchandise encore en boutique"];
  if (d.waitingDays !== null) {
    parts.push(
      d.waitingDays === 0 ? "en attente depuis aujourd'hui" : `en attente depuis ${d.waitingDays} j`,
    );
  }
  if (dueLabel) {
    parts.push(d.overdue ? `à retirer avant le ${dueLabel} (dépassé)` : `à retirer le ${dueLabel}`);
  }
  if (d.note) parts.push(d.note);
  return parts.join(" · ");
}

/** Classe de la puce : ambre tant qu'on attend, rouge dès que la date promise est passée. */
export function deliveryPillClass(d: SaleDelivery): string {
  if (!d.awaiting) return "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300";
  if (d.overdue) return "bg-red-500/12 text-red-700 dark:text-red-400";
  return "bg-amber-500/15 text-amber-800 dark:text-amber-300";
}
