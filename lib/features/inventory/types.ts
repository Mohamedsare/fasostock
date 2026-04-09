import type { ProductCategory } from "@/lib/features/products/types";

export type InventoryStatus = "ok" | "low" | "out";

export type InventoryRow = {
  productId: string;
  /** Première image `product_images` — affichage liste stock. */
  imageUrl: string | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  /** Filtre catégorie (aligné Flutter). */
  categoryId: string | null;
  unit: string;
  purchasePrice: number;
  salePrice: number;
  categoryName: string | null;
  brandName: string | null;
  /** `stock_min` produit brut. */
  stockMin: number;
  /** Seuil effectif (override boutique → stock_min → défaut société), comme Flutter `_effectiveMin`. */
  alertThreshold: number;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  status: InventoryStatus;
};

export type StockMovementRow = {
  id: string;
  productId: string;
  productName: string;
  type: string;
  quantity: number;
  notes: string | null;
  createdAt: string;
};

export type InventoryStats = {
  totalProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
  /** Σ qté × prix d'achat (référence). */
  stockValuePurchase: number;
  /** Σ qté × prix de vente — même logique que Flutter `_totalValue`. */
  stockValueSale: number;
};

export type InventoryScreenData = {
  rows: InventoryRow[];
  stats: InventoryStats;
  /** Seuil société lu depuis `company_settings` (défaut 5). */
  defaultThreshold: number;
  /** Même chargement que les lignes — évite une 2ᵉ requête et un décalage filtre / données. */
  categories: ProductCategory[];
};
