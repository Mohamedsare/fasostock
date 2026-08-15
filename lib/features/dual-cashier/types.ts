/**
 * Module « Caisse à deux » — un vendeur prépare le panier, un caissier l'encaisse.
 * Tables `pos_handoffs` / `pos_handoff_items` — migration 00191.
 *
 * Vocabulaire tenu partout, écran compris : le panier en transit est un **bon de caisse**
 * (« bon B-42 »). Ce n'est jamais une vente tant qu'il n'est pas encaissé — le mot compte,
 * parce que c'est exactement ce que le caissier doit comprendre en le regardant.
 */

export type PosHandoffStatus = "pending" | "paid" | "cancelled";

export const POS_HANDOFF_STATUS_LABELS: Record<PosHandoffStatus, string> = {
  pending: "En attente",
  paid: "Encaissé",
  cancelled: "Annulé",
};

export type PosHandoffItem = {
  id: string;
  productId: string;
  /** Nom figé à l'envoi : le caissier lit ce que le vendeur a scanné. */
  label: string;
  quantity: number;
  unitPrice: number;
  /** Remise de ligne (arrondi d'un conditionnement) — même sens qu'en caisse. */
  discount: number;
  position: number;
};

export type PosHandoff = {
  id: string;
  companyId: string;
  storeId: string;
  /** « B-42 » : le numéro qu'on annonce à voix haute d'un bout à l'autre du magasin. */
  number: string;
  status: PosHandoffStatus;

  customerId: string | null;
  subtotal: number;
  discount: number;
  total: number;

  note: string | null;
  prescriptionNumber: string | null;

  saleMode: "quick_pos" | "invoice_pos";
  documentType: "thermal_receipt" | "a4_invoice";

  createdBy: string | null;
  createdAt: string;

  claimedBy: string | null;
  claimedAt: string | null;

  saleId: string | null;
  paidBy: string | null;
  paidAt: string | null;

  cancelledBy: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;

  items: PosHandoffItem[];

  /** Noms résolus (`profiles.full_name`) — remplis par l'API, jamais par la base. */
  createdByName: string | null;
  claimedByName: string | null;
  paidByName: string | null;
  cancelledByName: string | null;
};

/** Total d'une ligne, remise de conditionnement déduite. */
export function handoffLineTotal(item: PosHandoffItem): number {
  return Math.max(0, item.quantity * item.unitPrice - item.discount);
}

/** Nombre d'articles (unités), pas de lignes : c'est ce que le caissier compte des yeux. */
export function handoffUnitCount(handoff: PosHandoff): number {
  return handoff.items.reduce((sum, i) => sum + i.quantity, 0);
}

/**
 * Depuis combien de temps ce bon attend, en clair.
 *
 * L'attente est l'information la plus utile de la file : derrière chaque bon, il y a
 * quelqu'un debout devant le comptoir. On l'écrit donc en toutes lettres plutôt qu'en
 * heure d'envoi, que le caissier devrait soustraire mentalement.
 */
export function waitingLabel(sinceIso: string, nowMs: number = Date.now()): string {
  const started = new Date(sinceIso).getTime();
  if (!Number.isFinite(started)) return "à l'instant";
  const seconds = Math.max(0, Math.round((nowMs - started) / 1000));
  if (seconds < 10) return "à l'instant";
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} h ${String(rest).padStart(2, "0")}` : `${hours} h`;
}

/**
 * Degré d'urgence d'un bon en attente, pour la couleur de sa carte.
 *
 * Les seuils viennent du comptoir, pas d'une convention d'interface : un client accepte
 * sans y penser une minute d'attente, commence à regarder autour de lui vers trois, et
 * se plaint au-delà de cinq. La file doit rendre ça visible d'un coup d'œil, de loin,
 * pour que le caissier prenne le plus ancien sans avoir à lire les horaires.
 */
export type HandoffUrgency = "fresh" | "waiting" | "late";

export function handoffUrgency(sinceIso: string, nowMs: number = Date.now()): HandoffUrgency {
  const started = new Date(sinceIso).getTime();
  if (!Number.isFinite(started)) return "fresh";
  const minutes = (nowMs - started) / 60000;
  if (minutes >= 5) return "late";
  if (minutes >= 2) return "waiting";
  return "fresh";
}

/** Un panier prêt à partir à la caisse (ce que la caisse envoie). */
export type PosHandoffDraftItem = {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
};
