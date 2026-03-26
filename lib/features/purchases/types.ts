export type PurchaseStatus =
  | "draft"
  | "confirmed"
  | "partially_received"
  | "received"
  | "cancelled";

export type SupplierLite = { id: string; name: string };

export type PurchaseListItem = {
  id: string;
  companyId: string;
  storeId: string;
  storeName: string;
  supplierId: string;
  supplierName: string;
  reference: string | null;
  status: PurchaseStatus;
  total: number;
  createdAt: string;
  updatedAt: string;
};

export type PurchaseItemInput = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
};

export type PurchaseItemRow = PurchaseItemInput & {
  id: string;
  total: number;
};

export type PurchaseDetail = PurchaseListItem & {
  items: PurchaseItemRow[];
};

