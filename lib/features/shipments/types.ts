/**
 * Module « Expéditions » — le colis qui part en province, et les frais qu'on avance.
 *
 * Voir l'en-tête de `supabase/migrations/00213_shipments.sql` : la marchandise est déjà
 * sortie du stock par la vente (ou l'enlèvement) à laquelle l'expédition se rattache.
 * Ce module ne touche jamais au stock — il suit le TRANSPORT et son remboursement.
 */

export type ShipmentStatus = "preparing" | "shipped" | "delivered" | "cancelled";

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  preparing: "Préparé",
  shipped: "Expédié",
  delivered: "Livré",
  cancelled: "Annulé",
};

/** Qui a payé le transporteur. `company` = la maison a avancé, donc à réclamer. */
export type ShippingPaidBy = "company" | "customer";

export type ShipmentReimbursement = {
  id: string;
  amount: number;
  method: string;
  reference: string | null;
  note: string | null;
  createdAt: string;
  createdByName: string | null;
};

export type ShipmentReminder = {
  id: string;
  channel: string;
  amountDue: number;
  createdAt: string;
  createdByName: string | null;
};

export type Shipment = {
  id: string;
  shipmentNumber: string;
  storeId: string;
  storeName: string | null;

  /** Document expédié — facultatifs tous les deux (voir la migration). */
  saleId: string | null;
  saleNumber: string | null;
  offtakeId: string | null;

  customerId: string | null;
  recipientName: string;
  recipientPhone: string | null;
  destination: string;

  carrier: string | null;
  carrierPhone: string | null;
  trackingRef: string | null;
  packageCount: number;
  packageNote: string | null;

  goodsAmount: number;

  shippingCost: number;
  shippingPaidBy: ShippingPaidBy;
  shippingReimbursed: number;
  /** `shippingCost − shippingReimbursed`, borné à zéro. Calculé, jamais stocké. */
  shippingRemaining: number;

  status: ShipmentStatus;
  shippedAt: string | null;
  deliveredAt: string | null;
  expectedAt: string | null;

  note: string | null;
  createdAt: string;
  createdByName: string | null;

  /** Dernière relance envoyée au sujet des frais — pour ne pas réclamer deux fois. */
  lastReminderAt: string | null;
  reminderCount: number;
};

export type CreateShipmentInput = {
  companyId: string;
  storeId: string;
  recipientName: string;
  destination: string;
  recipientPhone: string | null;
  customerId: string | null;
  saleId: string | null;
  offtakeId: string | null;
  carrier: string | null;
  carrierPhone: string | null;
  trackingRef: string | null;
  packageCount: number;
  packageNote: string | null;
  goodsAmount: number;
  shippingCost: number;
  shippingPaidBy: ShippingPaidBy;
  expectedAt: string | null;
  note: string | null;
  /** Clé d'idempotence — un renvoi après coupure réseau ne crée pas deux colis. */
  clientRequestId: string;
};

/** Une facture récente, proposée au rattachement lors de la création d'une expédition. */
export type ShippableSale = {
  id: string;
  saleNumber: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  total: number;
  createdAt: string;
};
