/** Aligné sur `Store` / `stores_repository.dart` (Flutter). */
export type Store = {
  id: string;
  company_id: string;
  name: string;
  code: string | null;
  address: string | null;
  logo_url: string | null;
  phone: string | null;
  email: string | null;
  description: string | null;
  is_active: boolean;
  is_primary: boolean;
  pos_discount_enabled: boolean;
  currency: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  invoice_prefix: string | null;
  footer_text: string | null;
  legal_info: string | null;
  signature_url: string | null;
  stamp_url: string | null;
  payment_terms: string | null;
  tax_label: string | null;
  tax_number: string | null;
  city: string | null;
  country: string | null;
  commercial_name: string | null;
  slogan: string | null;
  activity: string | null;
  mobile_money: string | null;
  invoice_short_title: string | null;
  invoice_signer_title: string | null;
  invoice_signer_name: string | null;
  invoice_template: string | null;
  /** Vente Engins : nom du signataire de la facture (« Je soussigné … »). */
  engine_invoice_signatory: string | null;
  /** Vente Engins : téléphones supplémentaires sur la facture (séparés par virgules). */
  engine_invoice_extra_phones: string | null;
  /** Largeur du ticket thermique (mm) pour le POS de cette boutique : 58 ou 80. `null` => 80 par défaut. */
  receipt_paper_width_mm: number | null;
  /** Mise en forme du ticket thermique : `classic` (défaut) ou `moderne`. `null` => classique. */
  receipt_template: string | null;
  /** true = la boutique partage tout le catalogue de l'entreprise (défaut). false = catalogue personnalisé (table store_products). */
  shares_company_catalog: boolean;
  /**
   * Mise en page des documents décidée par le propriétaire (migration 00218) :
   * éléments masqués et libellés remplacés, pour la facture A4 comme pour le ticket.
   * `null` (le cas de toutes les boutiques existantes) = documents d'origine.
   */
  invoice_layout?: unknown;
};
