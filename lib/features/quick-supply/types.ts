/**
 * Module « Approvisionnement » — l'arrivage express.
 *
 * Le commerçant traverse le marché, achète, revient, et doit vendre tout de suite.
 * Ce module écrit ce geste : entrée de stock en boutique, coût du jour, création à la
 * volée du produit qui manquait. Il ne crée ni achat fournisseur, ni dette, ni dépense
 * (voir l'en-tête de la migration `00193_quick_supply.sql`).
 */

/** Un produit du catalogue, réduit à ce que la saisie d'arrivage a besoin d'afficher. */
export type SupplyProduct = {
  id: string;
  name: string;
  unit: string;
  barcode: string | null;
  /** Alias de recherche (« Omo » pour « savon en poudre ») — utilisés si le patron les a activés. */
  searchAliases: string[];
  /** Vrai prix d'achat de la fiche produit. Jamais modifié par un arrivage. */
  cataloguePurchasePrice: number;
  /** Vrai prix de vente de la fiche produit. Jamais modifié par un arrivage. */
  catalogueSalePrice: number;
  /** Stock actuel dans la boutique en cours — ce que le réceptionnaire vérifie du coin de l'œil. */
  stock: number;
  /**
   * Première photo du produit (tri `position`), ou `null`. On reconnaît un article à
   * son emballage bien plus vite qu'à son libellé — surtout quand deux références se
   * ressemblent au nom près.
   */
  imageUrl: string | null;
};

/**
 * Une ligne en cours de saisie.
 *
 * ⚠️ Les deux prix ci-dessous sont ceux de L'ARRIVAGE, jamais ceux du produit. Ils ne
 * remplacent pas le catalogue : ils valent pour cette marchandise-là, tant qu'il en
 * reste en rayon. Les champs `catalogue*` sont les vrais prix du produit, affichés à
 * côté pour comparaison — jamais écrits.
 *
 * `productId === null` ⇒ produit à créer : l'article rapporté du marché qui n'a jamais
 * existé au catalogue. Il n'a alors ni stock ni prix catalogue, et les prix saisis
 * deviennent forcément les siens (c'est la seule exception à la règle).
 */
export type SupplyDraftLine = {
  /** Clé de rendu stable, indépendante du produit (une ligne « nouveau produit » n'en a pas). */
  key: string;
  productId: string | null;
  label: string;
  unit: string;
  quantity: number;
  /** Prix payé pour CET arrivage. */
  unitCost: number;
  /** Prix de vente de CETTE marchandise. `null` = vendre au prix du catalogue. */
  unitSalePrice: number | null;
  /** Vrais prix du produit, pour comparaison seule. `null` sur un produit à créer. */
  cataloguePurchasePrice: number | null;
  catalogueSalePrice: number | null;
  currentStock: number | null;
};

export type CreateQuickSupplyItem = {
  productId: string | null;
  label: string;
  unit?: string | null;
  barcode?: string | null;
  quantity: number;
  unitCost: number;
  unitSalePrice: number | null;
};

export type CreateQuickSupplyInput = {
  companyId: string;
  storeId: string;
  items: CreateQuickSupplyItem[];
  supplierLabel: string | null;
  /** `null` = payé comptant : la base retient le coût total. */
  amountPaid: number | null;
  note: string | null;
  /** Clé d'idempotence — un renvoi après coupure réseau ne double pas le stock. */
  clientRequestId: string;
};

/** Une ligne de l'historique d'un arrivage. */
export type QuickSupplyLine = {
  id: string;
  label: string;
  quantity: number;
  /** Ce qu'il reste à vendre de ce lot. 0 = écoulé, le catalogue a repris la main. */
  remainingQuantity: number;
  unitCost: number;
  unitSalePrice: number | null;
  /** Témoins : les vrais prix du produit à l'instant de l'arrivage. */
  cataloguePurchasePrice: number | null;
  catalogueSalePrice: number | null;
  productCreated: boolean;
};

/**
 * Prix imposé par un lot d'arrivage encore ouvert, pour un produit d'une boutique.
 * Lu par la caisse et superposé au catalogue, comme les promotions.
 */
export type SupplyLotPrice = {
  productId: string;
  supplyItemId: string;
  /** `null` = le lot ne change pas le prix de vente (il ne porte que le coût). */
  unitSalePrice: number | null;
  unitCost: number;
  /** Unités encore concernées, déjà bornées par le stock réel. */
  remaining: number;
  supplyNumber: string;
};

/** Un arrivage enregistré, tel que relu dans l'historique. */
export type QuickSupply = {
  id: string;
  supplyNumber: string;
  storeId: string;
  storeName: string | null;
  supplierLabel: string | null;
  note: string | null;
  totalCost: number;
  amountPaid: number;
  lineCount: number;
  unitCount: number;
  createdAt: string;
  createdBy: string | null;
  createdByName: string | null;
  lines: QuickSupplyLine[];
};
