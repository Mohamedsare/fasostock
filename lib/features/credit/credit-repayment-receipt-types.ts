export type CreditRepaymentReceiptData = {
  companyId: string;
  /** Nom légal / affichage entreprise — barre du haut du reçu. */
  companyName: string;
  storeId: string;
  customerId: string;
  creditId: string;
  paymentId?: string | null;
  receiptNumber: string;
  issuedAt: Date;
  storeName: string;
  /** Raison sociale affichée (Flutter : `commercial_name` puis `name`). */
  storeCommercialName?: string | null;
  storeLogoUrl?: string | null;
  storeAddress?: string | null;
  storePhone?: string | null;
  storeMobileMoney?: string | null;
  /** Couleur d’accent boutique (`#RRGGBB`) — fallback bleu comme l’app. */
  storePrimaryColor?: string | null;
  /** Pied de page facture / reçu (sinon texte par défaut). */
  storeFooterText?: string | null;
  invoiceSignerTitle?: string | null;
  invoiceSignerName?: string | null;
  customerName: string;
  customerPhone?: string | null;
  creditTitle: string;
  paymentMethodLabel: string;
  paymentMethodCode: "cash" | "mobile_money" | "card" | "transfer";
  paymentReference?: string | null;
  amountPaid: number;
  /** Espèces uniquement : montant réellement remis si billet > solde (sinon null). */
  amountTendered?: number | null;
  /** Espèces uniquement : monnaie à rendre (affichée sur le reçu). */
  changeDue?: number | null;
  previousBalance: number;
  newBalance: number;
  currency: string;
  dueAt?: Date | null;
  note?: string | null;
  settled: boolean;
};
