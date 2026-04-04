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
  /** Libellé affichable (profil) — renseigné par [listSales]. */
  created_by_label?: string | null;
  created_at: string;
  updated_at: string;
  sale_mode: "quick_pos" | "invoice_pos" | null;
  document_type: "thermal_receipt" | "a4_invoice" | null;
  /** Après migration Supabase `credit_due_at` (page Crédit). */
  credit_due_at?: string | null;
  credit_internal_note?: string | null;
  store?: { id: string; name: string } | null;
  customer?: { id: string; name: string; phone: string | null; address?: string | null } | null;
};
