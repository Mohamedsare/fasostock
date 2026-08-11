export type SaleStatus = "draft" | "completed" | "cancelled" | "refunded";

/**
 * Retrait de la marchandise — **indépendant** de `SaleStatus` : la vente est conclue et
 * encaissée dans les deux cas. `pending` = le client a payé et laissé les articles en
 * boutique (il revient plus tard). Voir migration 00188.
 */
export type SaleDeliveryState = "delivered" | "pending";

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
  /** Pharmacie : n° d'ordonnance associé à la dispensation. */
  prescription_number?: string | null;
  /**
   * Suivi de retrait (migration 00188). Absent sur une base non migrée ⇒ lu comme
   * « remise » par [saleDelivery] : aucun écran ne doit dépendre de la migration.
   */
  delivery_state?: SaleDeliveryState | null;
  /** Date annoncée par le client pour venir chercher (`YYYY-MM-DD`). */
  delivery_due_at?: string | null;
  /** Ce qui reste à remettre, où c'est rangé, qui viendra le chercher. */
  delivery_note?: string | null;
  /** Mise en attente : depuis quand la marchandise dort en boutique. */
  delivery_marked_at?: string | null;
  delivery_marked_by?: string | null;
  /** Remise effective — la trace qui répond à « je ne l'ai jamais reçu ». */
  delivered_at?: string | null;
  delivered_by?: string | null;
  store?: { id: string; name: string } | null;
  customer?: { id: string; name: string; phone: string | null; address?: string | null } | null;
  /**
   * Lignes de règlement — renseignées par [listSales] (colonne Acompte / statut de règlement).
   * `method = 'other'` = solde laissé à crédit, pas d'argent encaissé.
   */
  sale_payments?: Array<{
    id: string;
    method: string;
    amount: number;
    reference: string | null;
    created_at: string;
  }>;
};
