export type SaleStatus = "draft" | "completed" | "cancelled" | "refunded";

export type SaleItem = {
  id: string;
  company_id: string;
  store_id: string;
  customer_id: string | null;
  sale_number: string;
  status: SaleStatus;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  sale_mode: "quick_pos" | "invoice_pos" | null;
  document_type: "thermal_receipt" | "a4_invoice" | null;
  store?: { id: string; name: string } | null;
  customer?: { id: string; name: string; phone: string | null } | null;
};
