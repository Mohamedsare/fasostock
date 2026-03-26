/** Aligné `WarehouseStockLine` / `WarehouseMovement` / factures dépôt (Flutter). */

export type WarehouseStockLine = {
  productId: string;
  /** Première image `product_images` (tri position) — liste stock dépôt. */
  imageUrl: string | null;
  quantity: number;
  productName: string;
  sku: string | null;
  unit: string;
  avgUnitCost: number | null;
  purchasePrice: number;
  salePrice: number;
  stockMin: number;
  stockMinWarehouse: number;
  updatedAt: string | null;
};

export type WarehouseMovement = {
  id: string;
  productId: string;
  movementKind: string;
  quantity: number;
  unitCost: number | null;
  packagingType: string;
  packsQuantity: number;
  referenceType: string;
  referenceId: string | null;
  notes: string | null;
  createdAt: string | null;
  productName: string | null;
  productSku: string | null;
};

export type WarehouseDashboardSummary = {
  valueAtPurchasePrice: number;
  valueAtSalePrice: number;
  skuCount: number;
  lowStockCount: number;
  movementsEntries30d: number;
  movementsExits30d: number;
  chartDayLabels: string[];
  chartEntriesQty: number[];
  chartExitsQty: number[];
};

export type WarehouseDispatchInvoiceSummary = {
  id: string;
  companyId: string;
  customerId: string | null;
  customerName: string | null;
  documentNumber: string;
  notes: string | null;
  createdAt: string;
};

export type WarehouseDispatchInvoiceLine = {
  productId: string;
  productName: string;
  productSku: string | null;
  productUnit: string;
  quantity: number;
  unitPrice: number;
};

export type WarehouseDispatchInvoiceDetails = {
  id: string;
  companyId: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  documentNumber: string;
  notes: string | null;
  createdAt: string;
  lines: WarehouseDispatchInvoiceLine[];
};

export type WarehouseDispatchLineInput = {
  productId: string;
  quantity: number;
  unitPrice: number;
};

export const WAREHOUSE_PACKAGING_LABELS: Record<string, string> = {
  carton: "Carton",
  paquet: "Paquet",
  sachet: "Sachet",
  piece: "Pièce",
  lot: "Lot",
  unite: "Unité",
  autre: "Autre",
};
