/**
 * Module « Emplacements » — rangement physique des produits dans UNE boutique.
 * Voir `supabase/migrations/00167_product_locations.sql` pour le modèle de données.
 */

/** Un niveau du modèle d'organisation (ex. « Rayon », « Allée », « Étagère »). */
export type LocationLevel = { name: string };

/** `draft` : le plan se construit ; `active` : il est en service dans la boutique. */
export type LocationSchemeStatus = "draft" | "active";

/** Le modèle d'organisation d'une boutique : ses niveaux, dans l'ordre. */
export type LocationScheme = {
  id: string;
  storeId: string;
  name: string;
  templateSlug: string | null;
  levels: LocationLevel[];
  status: LocationSchemeStatus;
  activatedAt: string | null;
};

/** Un emplacement réel (nœud de l'arbre) + ce qu'il contient. */
export type LocationNode = {
  id: string;
  parentId: string | null;
  /** Index du niveau dans `LocationScheme.levels` (0 = premier niveau). */
  depth: number;
  name: string;
  code: string | null;
  sortOrder: number;
  /** Chemin lisible complet : « Boissons › Allée 2 › Étagère B ». */
  pathLabel: string;
  /** Produits rangés exactement ici. */
  directProductCount: number;
  /** Produits rangés ici ou dans un sous-emplacement. */
  totalProductCount: number;
};

/** Où est rangé un produit dans la boutique courante. */
export type ProductLocation = {
  productId: string;
  locationId: string;
  pathLabel: string;
  code: string | null;
  detail: string | null;
};

/** Résultat de la recherche « c'est où ? » (produit non rangé inclus). */
export type LocationSearchHit = {
  productId: string;
  productName: string;
  sku: string | null;
  barcode: string | null;
  locationId: string | null;
  pathLabel: string | null;
  code: string | null;
  detail: string | null;
  quantity: number;
};
