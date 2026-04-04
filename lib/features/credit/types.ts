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
