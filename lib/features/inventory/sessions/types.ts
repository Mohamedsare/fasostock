export type InventorySessionStatus = "open" | "closed" | "cancelled";

/** Ligne de la liste des sessions (RPC `inventory_session_list`, avec agrégats). */
export type InventorySessionSummary = {
  id: string;
  status: InventorySessionStatus;
  note: string | null;
  startedAt: string;
  closedAt: string | null;
  createdBy: string;
  /** Nombre total de produits snapshotés. */
  itemCount: number;
  /** Nombre de produits déjà comptés. */
  countedCount: number;
  /** Nombre de produits comptés présentant un écart (≠ 0). */
  varianceCount: number;
  /** Valeur nette des écarts au prix d'achat (positif = surplus, négatif = manquant). */
  varianceValuePurchase: number;
};

/** En-tête d'une session (écran de comptage). */
export type InventorySession = {
  id: string;
  storeId: string;
  status: InventorySessionStatus;
  note: string | null;
  startedAt: string;
  closedAt: string | null;
  createdBy: string;
};

/** Ligne de comptage d'une session. */
export type InventorySessionItem = {
  id: string;
  productId: string;
  productName: string;
  /** Stock théorique au démarrage de la session. */
  expectedQty: number;
  /** Quantité physiquement comptée (null tant que non comptée). */
  countedQty: number | null;
  /** compté − théorique (null tant que non compté). */
  variance: number | null;
  unitPurchasePrice: number;
  unitSalePrice: number;
  countedAt: string | null;
};
