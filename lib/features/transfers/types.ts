export type TransferStatus =
  | "draft"
  | "pending"
  | "approved"
  | "shipped"
  | "received"
  | "rejected"
  | "cancelled";

export type StockTransferListItem = {
  id: string;
  companyId: string;
  fromStoreId: string | null;
  toStoreId: string;
  fromWarehouse: boolean;
  status: TransferStatus;
  requestedBy: string;
  approvedBy: string | null;
  shippedAt: string | null;
  receivedAt: string | null;
  receivedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StockTransferItemRow = {
  id: string;
  transferId: string;
  productId: string;
  quantityRequested: number;
  quantityShipped: number;
  quantityReceived: number;
  productName: string | null;
};

export type StockTransferDetail = StockTransferListItem & {
  items: StockTransferItemRow[];
};

export type CreateTransferLineInput = {
  productId: string;
  quantityRequested: number;
};
