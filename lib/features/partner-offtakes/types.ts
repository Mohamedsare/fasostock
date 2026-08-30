/**
 * Module « Enlèvements partenaires » — la marchandise qu'un confrère vient prendre.
 *
 * L'exact opposé de l'Approvisionnement : là où celui-ci fait ENTRER ce que le
 * commerçant est allé chercher chez un voisin, celui-ci fait SORTIR ce qu'un voisin
 * vient chercher chez lui, avec ce qui est payé, ce qui reste dû, et le bon qu'on lui
 * remet. Voir l'en-tête de `supabase/migrations/00211_partner_offtakes.sql`.
 */

/** Un produit du catalogue, réduit à ce que la saisie d'un enlèvement affiche. */
export type OfftakeProduct = {
  id: string;
  name: string;
  unit: string;
  barcode: string | null;
  /** Alias de recherche (« Omo » pour « savon en poudre »), si le patron les a activés. */
  searchAliases: string[];
  /** Prix de vente comptoir — le repère par rapport auquel le patron consent sa remise. */
  catalogueSalePrice: number;
  /**
   * Prix de gros du catalogue (`products.wholesale_price`), s'il est renseigné. C'est
   * le prix proposé par défaut : neuf fois sur dix c'est celui-là que le commerçant
   * applique à un confrère, et le retaper à chaque ligne est le genre de friction qui
   * fait retourner au cahier.
   */
  catalogueWholesalePrice: number;
  /** Prix d'achat — sert au garde-fou « vous vendez à perte », jamais affiché tel quel. */
  cataloguePurchasePrice: number;
  /** Stock disponible dans la boutique en cours. */
  stock: number;
  imageUrl: string | null;
};

/** Une ligne en cours de saisie. */
export type OfftakeDraftLine = {
  /** Clé de rendu stable, indépendante du produit. */
  key: string;
  productId: string;
  label: string;
  unit: string;
  quantity: number;
  /** Prix consenti à CE partenaire. Ne remplace jamais le prix du catalogue. */
  unitPrice: number;
  /** Témoins, affichés à côté pour comparaison — jamais écrits dans la fiche produit. */
  catalogueSalePrice: number;
  cataloguePurchasePrice: number;
  currentStock: number;
};

export type CreatePartnerOfftakeInput = {
  companyId: string;
  storeId: string;
  items: { productId: string; quantity: number; unitPrice: number }[];
  partnerName: string;
  partnerPhone: string | null;
  /** Fiche client, si le commerçant en tient une pour ce partenaire. */
  customerId: string | null;
  /** Ce que le partenaire laisse tout de suite. 0 = tout à crédit. */
  amountPaid: number;
  /** Date convenue pour le solde (AAAA-MM-JJ), ou `null`. */
  dueAt: string | null;
  note: string | null;
  /** Clé d'idempotence — un renvoi après coupure réseau ne sort pas le stock deux fois. */
  clientRequestId: string;
};

export type PartnerOfftakeLine = {
  id: string;
  label: string;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  /** Photo du coût au moment de la sortie — sert à savoir si le gros reste rentable. */
  unitCost: number | null;
  catalogueSalePrice: number | null;
};

export type PartnerOfftakePayment = {
  id: string;
  amount: number;
  method: string;
  reference: string | null;
  note: string | null;
  createdAt: string;
  createdByName: string | null;
};

/** Un enlèvement enregistré, tel que relu dans la liste. */
export type PartnerOfftake = {
  id: string;
  offtakeNumber: string;
  storeId: string;
  storeName: string | null;
  partnerName: string;
  partnerPhone: string | null;
  customerId: string | null;
  note: string | null;
  totalAmount: number;
  amountPaid: number;
  /** `totalAmount − amountPaid`, borné à zéro. Calculé côté client, jamais stocké. */
  remaining: number;
  dueAt: string | null;
  lineCount: number;
  unitCount: number;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  createdByName: string | null;
  lines: PartnerOfftakeLine[];
};

/** État métier d'un enlèvement — dérivé, jamais stocké (la vérité est dans les montants). */
export type OfftakeStatus = "cancelled" | "paid" | "partial" | "unpaid" | "overdue";

export const OFFTAKE_STATUS_LABELS: Record<OfftakeStatus, string> = {
  cancelled: "Annulé",
  paid: "Soldé",
  partial: "Partiellement payé",
  unpaid: "Non payé",
  overdue: "En retard",
};

/**
 * Une page d'historique. `hasMore` vient d'une ligne lue en trop côté serveur, jamais
 * d'un `count` : compter toute la table à chaque page coûterait plus cher que la page
 * elle-même, et la seule question posée par l'écran est « y a-t-il une suite ? ».
 */
export type PartnerOfftakePage = {
  rows: PartnerOfftake[];
  hasMore: boolean;
};

/**
 * Vingt lignes par page — même mesure que l'historique des mouvements de stock.
 * C'est ce qui tient sur un écran de téléphone sans défilement interminable, et ce qui
 * arrive vite sur une connexion de marché.
 */
export const OFFTAKES_PAGE_SIZE = 20;
