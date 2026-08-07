/**
 * Module « Prix de revient » — un ARRIVAGE = marchandise + frais d'approche.
 * Types alignés sur la migration `00174_landed_cost.sql`.
 */

export type BatchStatus = "draft" | "applied" | "cancelled";

/**
 * `receive`     — l'arrivage entre lui-même le stock (achat non saisi ailleurs) ;
 * `prices_only` — le stock est déjà entré (module Achats) : on ne touche qu'aux prix.
 */
export type StockMode = "receive" | "prices_only";

/**
 * Coût retenu comme nouveau prix d'achat :
 * `weighted_average` — moyenne pondérée avec l'ancien stock (défaut, honnête) ;
 * `last_cost`        — coût du seul arrivage.
 */
export type CostingMethod = "weighted_average" | "last_cost";

/** Clé de répartition d'un frais sur les lignes. */
export type AllocationMethod = "value" | "quantity" | "weight" | "volume" | "manual";

/**
 * `markup_percent` — coût majoré de X % ;
 * `margin_percent` — X % du prix de vente (taux de marque) ;
 * `amount`         — coût + X francs ;
 * `fixed_price`    — prix imposé, la marge en découle.
 */
export type MarginMode = "markup_percent" | "margin_percent" | "amount" | "fixed_price";

export type ChargeKind =
  | "transport"
  | "douane"
  | "manutention"
  | "assurance"
  | "taxe"
  | "magasinage"
  | "commission"
  | "emballage"
  | "autre";

/** Ligne de la liste des arrivages (RPC `cost_batches_overview`). */
export type CostBatch = {
  id: string;
  storeId: string;
  storeName: string;
  supplierId: string | null;
  supplierName: string | null;
  label: string;
  reference: string | null;
  status: BatchStatus;
  stockMode: StockMode;
  costingMethod: CostingMethod;
  allocationMethod: AllocationMethod;
  currencyCode: string;
  exchangeRate: number;
  /** Arrondi commercial du prix de vente conseillé (0 = aucun). */
  rounding: number;
  marginMode: MarginMode;
  marginValue: number;
  orderedAt: string | null;
  receivedAt: string | null;
  notes: string | null;
  itemsCount: number;
  totalQuantity: number;
  /** Montants déjà convertis en CFA. */
  goodsTotal: number;
  chargesTotal: number;
  landedTotal: number;
  appliedAt: string | null;
  pricesRevertedAt: string | null;
  createdAt: string;
};

export type CostBatchItem = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  /** Prix fournisseur unitaire, DANS LA DEVISE DU LOT. */
  unitPrice: number;
  weightKg: number | null;
  volumeM3: number | null;
  manualShare: number | null;
  /** `null` = marge du lot. */
  marginMode: MarginMode | null;
  marginValue: number | null;
  applySalePrice: boolean;
  sortOrder: number;
  /** Photo prise à l'application — absente tant que l'arrivage est en brouillon. */
  prevPurchasePrice: number | null;
  prevSalePrice: number | null;
  appliedPurchasePrice: number | null;
  appliedSalePrice: number | null;
};

export type CostBatchCharge = {
  id: string;
  label: string;
  kind: ChargeKind;
  /** Montant DANS LA DEVISE DU LOT. */
  amount: number;
  /** `null` = clé de répartition du lot. */
  allocationMethod: AllocationMethod | null;
  sortOrder: number;
};

/**
 * Ligne calculée par le serveur (RPC `cost_batch_compute`) — tous les montants sont
 * en CFA, conversion déjà faite. C'est ce que l'écran affiche ET ce que
 * `cost_batch_apply` écrit : aucune divergence possible.
 */
export type ComputedLine = {
  itemId: string;
  productId: string;
  productName: string;
  unit: string;
  sortOrder: number;
  quantity: number;
  unitPrice: number;
  goodsTotal: number;
  allocatedCharges: number;
  landedTotal: number;
  /** Coût de revient unitaire de CET arrivage. */
  unitLandedCost: number;
  /** Stock détenu avant l'arrivage (toutes boutiques). */
  stockBefore: number;
  currentPurchasePrice: number;
  currentSalePrice: number;
  /** Moyenne pondérée ancien stock + arrivage. */
  weightedCost: number;
  /** Coût qui deviendra le prix d'achat du catalogue. */
  retainedCost: number;
  marginMode: MarginMode;
  marginValue: number;
  suggestedSalePrice: number;
  marginAmount: number;
  /** Taux de marque (% du prix de vente). */
  marginRate: number;
  applySalePrice: boolean;
};

/** Une ligne d'historique de prix d'un produit (RPC `product_price_history`). */
export type PriceChange = {
  id: string;
  createdAt: string;
  source: "cost_batch" | "cost_batch_revert";
  batchId: string | null;
  batchLabel: string | null;
  oldPurchasePrice: number | null;
  newPurchasePrice: number | null;
  oldSalePrice: number | null;
  newSalePrice: number | null;
  stockAtChange: number | null;
  authorName: string | null;
};

/** Totaux d'un arrivage, recalculés à l'écran à partir des lignes serveur. */
export type BatchTotals = {
  goods: number;
  charges: number;
  landed: number;
  quantity: number;
  /** Poids des frais dans le coût total — le chiffre qui fait réagir le commerçant. */
  chargesRate: number;
  /** Chiffre d'affaires attendu si tout part au prix conseillé. */
  expectedRevenue: number;
  expectedMargin: number;
};
