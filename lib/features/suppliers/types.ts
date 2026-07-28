export type Supplier = {
  id: string;
  company_id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  code: string | null;
  is_active: boolean;
  city: string | null;
  tax_id: string | null;
  bank_details: string | null;
  category: string | null;
  /** Délai de règlement accordé (jours). 0 = comptant. */
  payment_terms_days: number;
  /** Encours maximum souhaité. 0 = non suivi. */
  credit_limit: number;
  /** Dette de départ (reprise d'antériorité). */
  opening_balance: number;
  created_at: string;
  updated_at: string;
};

export type SupplierFormInput = {
  name: string;
  contact?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  code?: string | null;
  city?: string | null;
  taxId?: string | null;
  bankDetails?: string | null;
  category?: string | null;
  isActive?: boolean;
  paymentTermsDays?: number;
  creditLimit?: number;
  openingBalance?: number;
};

/** Origine d'une dette fournisseur. */
export type SupplierInvoiceSource = "purchase" | "manual" | "opening";

export type SupplierInvoiceStatus = "open" | "partially_paid" | "paid" | "cancelled";

/** Une dette : facture, bon, ardoise, solde de départ, ou miroir d'un achat. */
export type SupplierInvoice = {
  id: string;
  companyId: string;
  supplierId: string;
  supplierName: string;
  storeId: string | null;
  purchaseId: string | null;
  source: SupplierInvoiceSource;
  invoiceNumber: string | null;
  label: string | null;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: SupplierInvoiceStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SupplierPaymentMethod = "cash" | "mobile_money" | "card" | "transfer" | "other";

export type SupplierPayment = {
  id: string;
  companyId: string;
  supplierId: string;
  supplierName: string;
  storeId: string | null;
  amount: number;
  /** Part déjà imputée sur des dettes. Le reste est une avance. */
  allocatedAmount: number;
  method: SupplierPaymentMethod;
  paidAt: string;
  reference: string | null;
  notes: string | null;
  source: "manual" | "purchase";
  createdAt: string;
};

/** Ce que l'imputation d'un règlement a soldé, pour le relevé d'un fournisseur. */
export type SupplierAllocation = {
  id: string;
  paymentId: string;
  invoiceId: string;
  amount: number;
};

/** Situation financière agrégée d'un fournisseur (RPC `supplier_payables_overview`). */
export type SupplierPayableStats = {
  supplierId: string;
  /** Σ des dettes non annulées. */
  totalDue: number;
  /** Σ des imputations. */
  totalPaid: number;
  /** Reste à payer = totalDue − totalPaid. */
  balance: number;
  /** Versements non imputés (avance chez le fournisseur). */
  creditAvailable: number;
  overdueAmount: number;
  dueSoonAmount: number;
  openInvoices: number;
  overdueInvoices: number;
  oldestDueDate: string | null;
  nextDueDate: string | null;
  lastPaymentAt: string | null;
  lastInvoiceDate: string | null;
  purchasesCount: number;
};

/** Fournisseur + sa situation, l'objet manipulé par toute la page. */
export type SupplierAccount = Supplier & {
  stats: SupplierPayableStats;
  /** Nombre de jours de retard de la dette la plus ancienne (0 si à jour). */
  daysLate: number;
  /** Dépassement de l'encours autorisé. */
  overLimit: boolean;
};

export type SupplierInvoiceFormInput = {
  id: string | null;
  supplierId: string;
  storeId: string | null;
  invoiceNumber: string;
  label: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  notes: string;
};

export type SupplierPaymentFormInput = {
  supplierId: string;
  storeId: string | null;
  amount: number;
  method: SupplierPaymentMethod;
  paidAt: string;
  reference: string;
  notes: string;
  /** `null` ⇒ imputation FIFO automatique sur les échéances les plus anciennes. */
  allocations: { invoiceId: string; amount: number }[] | null;
};

/** Tranches d'antériorité de la dette (analyse « balance âgée »). */
export type SupplierAgingBuckets = {
  notDue: number;
  d1to30: number;
  d31to60: number;
  d61to90: number;
  d90plus: number;
};

export const SUPPLIER_PAYMENT_METHOD_LABELS: Record<SupplierPaymentMethod, string> = {
  cash: "Espèces",
  mobile_money: "Mobile Money",
  card: "Carte",
  transfer: "Virement",
  other: "Autre",
};

export const SUPPLIER_INVOICE_SOURCE_LABELS: Record<SupplierInvoiceSource, string> = {
  purchase: "Achat",
  manual: "Facture saisie",
  opening: "Solde de départ",
};

export const SUPPLIER_INVOICE_STATUS_LABELS: Record<SupplierInvoiceStatus, string> = {
  open: "À payer",
  partially_paid: "Partiel",
  paid: "Soldée",
  cancelled: "Annulée",
};
