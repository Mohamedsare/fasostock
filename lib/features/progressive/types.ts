/**
 * Module « Achats Progressifs » — épargne par versements successifs vers un achat
 * (tous métiers : motos, électroménager, meubles, matériaux…).
 * Aligné sur la migration `00154_progressive_purchases.sql`.
 */

export type ProgressivePlanStatus = "open" | "converted" | "cancelled";

/** Nature d'un mouvement du grand livre : versement (+), remboursement (−), consommation (−). */
export type ProgressiveLedgerKind = "deposit" | "refund" | "settlement";

/** Moyens de paiement (enum `payment_method` Supabase). */
export type ProgressivePaymentMethod =
  | "cash"
  | "mobile_money"
  | "card"
  | "transfer"
  | "other";

export const PROGRESSIVE_METHOD_LABELS: Record<ProgressivePaymentMethod, string> = {
  cash: "Espèces",
  mobile_money: "Mobile Money",
  card: "Carte",
  transfer: "Virement",
  other: "Autre",
};

/**
 * Libellés de statut. `converted` dépend du métier (« Engin remis », « Article
 * remis »…) — voir `progressiveStatusLabels()` dans `progressive-terms.ts`.
 */
export const PROGRESSIVE_STATUS_LABELS: Record<ProgressivePlanStatus, string> = {
  open: "En cours",
  converted: "Remis au client",
  cancelled: "Annulé",
};

/** Ligne de la liste des dossiers (RPC `progressive_plans_list`). */
export type ProgressivePlan = {
  id: string;
  planNumber: string;
  storeId: string;
  customerId: string | null;
  clientName: string;
  clientPhone: string | null;
  clientIdType: string | null;
  clientIdNumber: string | null;
  clientAddress: string | null;
  /** Article visé (optionnel — le client ne choisit pas forcément au départ). */
  targetProductId: string | null;
  targetProductName: string | null;
  targetProductPrice: number | null;
  /** Objectif saisi à la main (prioritaire sur le prix de l'article visé). */
  targetAmount: number | null;
  status: ProgressivePlanStatus;
  convertedSaleId: string | null;
  convertedSaleNumber: string | null;
  convertedAt: string | null;
  notes: string | null;
  createdAt: string;
  depositCount: number;
  totalDeposited: number;
  totalRefunded: number;
  totalSettled: number;
  /** Épargne disponible = versements − remboursements − consommations. */
  balance: number;
  firstDepositAt: string | null;
  lastDepositAt: string | null;
};

/** Mouvement du relevé d'un dossier (RPC `progressive_ledger_list`). */
export type ProgressiveLedgerEntry = {
  id: string;
  kind: ProgressiveLedgerKind;
  amount: number;
  method: ProgressivePaymentMethod | null;
  reference: string | null;
  note: string | null;
  receiptNumber: string | null;
  saleId: string | null;
  createdAt: string;
  createdByName: string | null;
};

export type ProgressivePlanInput = {
  id?: string | null;
  companyId: string;
  storeId: string;
  customerId?: string | null;
  clientName: string;
  clientPhone?: string | null;
  clientIdType?: string | null;
  clientIdNumber?: string | null;
  clientAddress?: string | null;
  targetProductId?: string | null;
  targetAmount?: number | null;
  notes?: string | null;
};

export type ProgressiveMovementResult = {
  ledgerId: string;
  receiptNumber: string;
  balance: number;
};

/** Résultat d'une annulation : le solde éventuel a été remboursé au client. */
export type ProgressiveCancellationResult = {
  /** Ligne de remboursement créée (`null` si le dossier était déjà à zéro). */
  refundLedgerId: string | null;
  refundReceiptNumber: string | null;
  refundedAmount: number;
};

export type ProgressiveConversionResult = {
  saleId: string;
  saleNumber: string;
  total: number;
  /** Reliquat d'épargne non consommé par la vente (à rembourser au client). */
  residual: number;
};

/** Article que l'épargne du client permet (ou presque) de prendre en boutique. */
export type ProgressiveEligibleItem = {
  productId: string;
  name: string;
  price: number;
  stock: number;
  imageUrl: string | null;
  /** Manque à combler : 0 si l'épargne suffit déjà. */
  missing: number;
};
