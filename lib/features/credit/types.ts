import type { SaleItem } from "@/lib/features/sales/types";

export type CreditPaymentRow = {
  id: string;
  method: string;
  amount: number;
  reference: string | null;
  created_at: string;
};

/** Vente avec lignes de paiement — pour la page Crédit. */
export type CreditSaleRow = SaleItem & {
  sale_payments: CreditPaymentRow[];
};

/** Statut métier dérivé (reste à payer + échéance). */
export type CreditLineStatus =
  | "non_paye"
  | "partiel"
  | "solde"
  | "en_retard"
  | "annule";

/** Agrégation par client (vue 2). */
export type CustomerCreditAggregate = {
  customerId: string;
  customerName: string;
  phone: string | null;
  openSaleCount: number;
  totalDue: number;
  overdueAmount: number;
  lastPaymentAt: string | null;
  nextDueAt: string | null;
  risk: "normal" | "attention" | "critique";
};

export type LegacyCreditPaymentRow = {
  id: string;
  method: "cash" | "mobile_money" | "card" | "transfer" | "other";
  amount: number;
  reference: string | null;
  created_at: string;
};

export type LegacyCreditRow = {
  id: string;
  company_id: string;
  store_id: string;
  customer_id: string;
  title: string;
  principal_amount: number;
  due_at: string | null;
  internal_note: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  store: { id: string; name: string } | null;
  customer: { id: string; name: string; phone: string | null } | null;
  payments: LegacyCreditPaymentRow[];
};
