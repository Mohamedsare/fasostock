export type ProductStatus = "active" | "inactive";

export type ProductCategory = {
  id: string;
  company_id: string;
  name: string;
};

export type ProductBrand = {
  id: string;
  company_id: string;
  name: string;
};

/** Aligné sur `ProductImage` (Flutter) — table `product_images`. */
export type ProductImageRow = {
  id: string;
  product_id?: string;
  url: string;
  position: number;
};

/** Aligné `product_scope` Supabase / Flutter. */
export type ProductScope = "both" | "warehouse_only" | "boutique_only";

/**
 * Conditionnement d'un produit (table `product_packagings`) — ex. paquet, carton.
 * Le code-barres « pièce » reste `ProductItem.barcode` ; cette table ajoute les
 * conditionnements plus grands. Le stock reste compté en unité de base (pièce) :
 * scanner un conditionnement ajoute `factor` pièces au panier.
 */
export type ProductPackaging = {
  id: string;
  company_id?: string;
  product_id?: string;
  /** Libellé (ex. « Carton », « Paquet »). */
  label: string;
  /** Code-barres propre au conditionnement (GTIN paquet/carton). */
  barcode: string | null;
  /** Nombre d'unités de base (pièces) contenues. ≥ 1. */
  factor: number;
  /** Prix de vente du conditionnement ; `null` = factor × prix pièce. */
  price: number | null;
  position: number;
};

export type ProductItem = {
  id: string;
  company_id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  unit: string;
  purchase_price: number;
  sale_price: number;
  /** Prix unitaire gros (FCFA) — si qté ligne ≥ wholesale_qty. */
  wholesale_price: number;
  /** Seuil (≥ 1) pour appliquer wholesale_price ; 0 = désactivé. */
  wholesale_qty: number;
  stock_min: number;
  description: string | null;
  is_active: boolean;
  category_id: string | null;
  brand_id: string | null;
  /** `both` | `warehouse_only` | `boutique_only` */
  product_scope?: string | null;
  category?: { id: string; name: string } | null;
  brand?: { id: string; name: string } | null;
  /** Tri par `position` asc. — première = miniature liste (comme Flutter). */
  product_images?: ProductImageRow[] | null;
  /** Conditionnements (paquet/carton) — tri par `position` asc. Vide si aucun. */
  product_packagings?: ProductPackaging[] | null;
  /**
   * Autres appellations du produit (4 max) — SERVENT UNIQUEMENT À LA RECHERCHE.
   * Le nom affiché partout (tickets, factures, rapports) reste `name`.
   */
  search_aliases?: string[] | null;
  /**
   * Champs métier additionnels (ex. pharmacie). Colonnes nullables ajoutées par
   * migration additive — `null`/absent pour les métiers qui ne les utilisent pas.
   */
  dci?: string | null;
  dosage_form?: string | null;
  therapeutic_class?: string | null;
  laboratory?: string | null;
  prescription_required?: boolean | null;
  storage_conditions?: string | null;
};

/** Champs produit propres à un métier — saisis dans une section dédiée du formulaire. */
export type ActivityProductFieldValues = {
  dci: string;
  dosage_form: string;
  therapeutic_class: string;
  laboratory: string;
  prescription_required: boolean;
  storage_conditions: string;
};

export type ProductFormInput = {
  name: string;
  sku: string;
  barcode: string;
  unit: string;
  purchasePrice: number;
  salePrice: number;
  wholesalePrice: number;
  wholesaleQty: number;
  stockMin: number;
  description: string;
  categoryId: string;
  brandId: string;
  productScope: ProductScope;
  isActive: boolean;
  /**
   * Autres noms du produit (recherche uniquement), saisis quand le propriétaire a
   * activé la fonction. `undefined` = le formulaire ne gère pas ce champ → la couche
   * API n'envoie alors PAS la colonne (les alias existants restent intacts).
   */
  searchAliases?: string[];
  /**
   * Champs métier additionnels (ex. pharmacie). `undefined` = métier sans champs
   * spécifiques → la couche API n'envoie alors aucune colonne supplémentaire.
   */
  activityFields?: ActivityProductFieldValues;
};

/**
 * Conditionnement saisi dans le formulaire produit. `id` présent = ligne existante
 * (mise à jour) ; absent = nouvelle ligne (insertion).
 */
export type ProductPackagingDraft = {
  id?: string;
  label: string;
  barcode: string;
  factor: number;
  /** `null` = pas de prix dédié → factor × prix pièce. */
  price: number | null;
};

/** Soumission formulaire produit — aligné `ProductFormDialog` Flutter. */
export type ProductFormSavePayload = {
  input: ProductFormInput;
  pendingImages: File[];
  removedImageIds: string[];
  /** Conditionnements voulus (état final affiché dans le formulaire). */
  packagings: ProductPackagingDraft[];
  /** Ids de conditionnements existants supprimés dans le formulaire. */
  removedPackagingIds: string[];
  /** Création uniquement — ajustement stock boutique si > 0. */
  initialStock: number;
  /**
   * Création uniquement — lot daté initial (métiers à suivi de péremption).
   * Crée une ligne `product_batches` juste après la création du produit.
   */
  initialBatch?: {
    expiryDate: string;
    quantity: number;
    lotNumber: string;
  } | null;
};
