/**
 * Module Pièces — compatibilités par modèle, équivalences, variantes.
 * Voir `supabase/migrations/00164_parts_compatibility_variants.sql`.
 */

/** Un modèle d'engin / véhicule / appareil auquel des pièces s'adaptent. */
export type PartModel = {
  id: string;
  name: string;
  /** Marque / constructeur — ex. « Yamaha ». */
  maker: string | null;
  /** Millésimes couverts, saisie libre — ex. « 2008-2015 ». */
  years: string | null;
  note: string | null;
  /** Nombre de pièces déclarées compatibles. */
  productCount: number;
  createdAt: string | null;
};

export type PartModelInput = {
  id?: string | null;
  name: string;
  maker: string;
  years: string;
  note: string;
};

/** Une pièce compatible avec le modèle recherché, stock du périmètre courant inclus. */
export type CompatiblePart = {
  productId: string;
  productName: string;
  sku: string | null;
  barcode: string | null;
  unit: string;
  salePrice: number;
  stock: number;
  modelId: string;
  modelName: string;
  modelMaker: string | null;
  isActive: boolean;
};

/** Nature du remplaçant, vue depuis le produit d'origine. */
export type EquivalenceKind = "origine" | "generique" | "adaptable" | "equivalent";

export const EQUIVALENCE_KIND_LABELS: Record<EquivalenceKind, string> = {
  origine: "Pièce d'origine",
  generique: "Générique",
  adaptable: "Adaptable",
  equivalent: "Équivalent",
};

/** Un remplaçant possible, avec son stock — la réponse à « c'est en rupture ». */
export type ProductEquivalent = {
  equivalentId: string;
  productName: string;
  sku: string | null;
  barcode: string | null;
  unit: string;
  salePrice: number;
  stock: number;
  kind: EquivalenceKind;
  note: string | null;
  isActive: boolean;
};

/** Ligne de la liste « Équivalences » : un produit et l'état de ses remplaçants. */
export type EquivalenceOverviewRow = {
  productId: string;
  productName: string;
  sku: string | null;
  stock: number;
  equivalentCount: number;
  /** Combien de ces remplaçants sont réellement disponibles maintenant. */
  inStockAlternatives: number;
};

/** Une déclinaison au sein d'une famille — reste une fiche produit à part entière. */
export type VariantMember = {
  productId: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  salePrice: number;
  stock: number;
  isActive: boolean;
  /** Valeurs des axes — ex. `{ Couleur: "Rouge", Taille: "XL" }`. */
  attributes: Record<string, string>;
};

/** Famille de déclinaisons : une « fiche » qui regroupe plusieurs produits. */
export type VariantGroup = {
  id: string;
  name: string;
  /** Axes de déclinaison — ex. `["Couleur", "Taille"]`. 1 à 3. */
  attributeNames: string[];
  note: string | null;
  totalStock: number;
  members: VariantMember[];
};

export type VariantGroupInput = {
  id?: string | null;
  name: string;
  attributeNames: string[];
  note: string;
};
