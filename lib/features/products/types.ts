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
};

/** Soumission formulaire produit — aligné `ProductFormDialog` Flutter. */
export type ProductFormSavePayload = {
  input: ProductFormInput;
  pendingImages: File[];
  removedImageIds: string[];
  /** Création uniquement — ajustement stock boutique si > 0. */
  initialStock: number;
};
