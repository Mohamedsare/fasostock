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
  purchasePrice: number;
  salePrice: number;
  /** Stock actuel dans la boutique en cours — ce que le réceptionnaire vérifie du coin de l'œil. */
  stock: number;
};

/**
 * Une ligne en cours de saisie.
 *
 * `productId === null` ⇒ produit à créer : c'est le cas de l'article rapporté du
 * marché qui n'a jamais existé au catalogue. Il n'a alors ni stock ni ancien prix.
 */
export type SupplyDraftLine = {
  /** Clé de rendu stable, indépendante du produit (une ligne « nouveau produit » n'en a pas). */
  key: string;
  productId: string | null;
  label: string;
  unit: string;
  quantity: number;
  purchasePrice: number;
  /** Prix de vente à appliquer. `null` = inchangé (produit existant). */
  salePrice: number | null;
  /** Valeurs actuelles en base, pour montrer ce qui change. */
  currentPurchasePrice: number | null;
  currentSalePrice: number | null;
  currentStock: number | null;
};

export type CreateQuickSupplyItem = {
  productId: string | null;
  label: string;
  unit?: string | null;
  barcode?: string | null;
  quantity: number;
  purchasePrice: number;
  salePrice: number | null;
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
  purchasePrice: number;
  previousPurchasePrice: number | null;
  salePrice: number | null;
  previousSalePrice: number | null;
  productCreated: boolean;
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
