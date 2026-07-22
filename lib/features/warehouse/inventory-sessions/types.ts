export type WarehouseInventorySessionStatus = "open" | "closed" | "cancelled";

/** Ligne de la liste des sessions (RPC `warehouse_inventory_session_list`, avec agrégats). */
export type WarehouseInventorySessionSummary = {
  id: string;
  warehouseId: string;
  status: WarehouseInventorySessionStatus;
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
  /** Valeur nette des écarts au coût (positif = surplus, négatif = manquant). */
  varianceValuePurchase: number;
};

/** En-tête d'une session (écran de comptage). */
export type WarehouseInventorySession = {
  id: string;
  warehouseId: string;
  companyId: string;
  status: WarehouseInventorySessionStatus;
  note: string | null;
  startedAt: string;
  closedAt: string | null;
  createdBy: string;
};

/** Ligne de comptage d'une session. */
export type WarehouseInventorySessionItem = {
  id: string;
  productId: string;
  productName: string;
  /** Stock théorique du dépôt au démarrage de la session. */
  expectedQty: number;
  /** Quantité physiquement comptée (null tant que non comptée). */
  countedQty: number | null;
  /** compté − théorique (null tant que non compté). */
  variance: number | null;
  /** Coût unitaire au snapshot (CMP dépôt, à défaut prix d'achat produit). */
  unitPurchasePrice: number;
  countedAt: string | null;
};
