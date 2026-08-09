/** Aligné sur `ReceiptTicketData` Flutter (`receipt_ticket_dialog.dart`). */
export type ReceiptTicketItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type ReceiptTicketData = {
  /**
   * Devise de l'entreprise (code ISO). Renseignée par le client, qui seul la connaît :
   * la génération du ticket côté serveur est partagée entre requêtes et ne peut pas
   * avoir de devise ambiante. Absente, le ticket s'imprime en francs CFA — comportement
   * d'origine, donc les tickets déjà en circulation restent identiques.
   */
  currencyCode?: string | null;
  storeName: string;
  /** `stores.logo_url` — centré en tête (Flutter `ReceiptTicketData.storeLogoUrl`). */
  storeLogoUrl?: string | null;
  storeAddress: string | null;
  storePhone: string | null;
  saleNumber: string;
  /** UUID vente (QR / traçabilité) — aligné Flutter `ReceiptTicketData.saleId`. */
  saleId?: string | null;
  items: ReceiptTicketItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: string;
  /**
   * Vente réglée en plusieurs moyens (caisse rapide : espèces + mobile money) —
   * détail imprimé sous la ligne « Paiement ». Absent, le ticket est inchangé.
   */
  paymentSplit?: Array<{ label: string; amount: number }> | null;
  amountReceived?: number | null;
  change?: number | null;
  date: Date;
  customerName?: string | null;
  customerPhone?: string | null;
  /** Vente à crédit — montant encaissé au comptoir (acompte). */
  creditPaid?: number | null;
  /** Vente à crédit — reste dû par le client (> 0 ⇒ bloc crédit imprimé). */
  creditRemaining?: number | null;
  /** Échéance déjà formatée (ex. « 31/08/2026 ») — évite de transporter une `Date`. */
  creditDueLabel?: string | null;
};
