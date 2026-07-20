"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Catalogue produits d'une boutique.
 *
 * - Une boutique avec `shares_company_catalog = true` (défaut) voit/vend TOUT le
 *   catalogue de l'entreprise : aucune restriction (`fetchStoreCatalog` renvoie `null`).
 * - Une boutique avec `shares_company_catalog = false` a un catalogue personnalisé
 *   limité aux produits de `store_products` : `fetchStoreCatalog` renvoie l'ensemble
 *   des `product_id` autorisés.
 */

/**
 * `null` = la boutique partage tout le catalogue (pas de filtrage). Sinon, liste des
 * IDs produits autorisés. On renvoie un **tableau** (et non un `Set`) car cette valeur
 * transite par le cache React Query (persistance/sérialisation) : un `Set` y serait
 * corrompu. La conversion en `Set` se fait dans `useStoreCatalog` (via `select`).
 */
export async function fetchStoreCatalog(
  storeId: string | null,
): Promise<string[] | null> {
  if (!storeId) return null;
  const supabase = createClient();
  const { data: store, error: storeErr } = await supabase
    .from("stores")
    .select("shares_company_catalog")
    .eq("id", storeId)
    .maybeSingle();
  if (storeErr) throw storeErr;
  // Absent/null ou true => partage tout le catalogue (comportement historique).
  if (!store || (store as { shares_company_catalog?: boolean }).shares_company_catalog !== false) {
    return null;
  }
  const { data, error } = await supabase
    .from("store_products")
    .select("product_id")
    .eq("store_id", storeId);
  if (error) throw error;
  return (data ?? []).map((r) => String((r as { product_id: unknown }).product_id));
}

/** Restreint une liste de produits au catalogue d'une boutique. `catalog === null` => aucun filtrage. */
export function filterByStoreCatalog<T extends { id: string }>(
  products: T[],
  catalog: Set<string> | null,
): T[] {
  if (!catalog) return products;
  return products.filter((p) => catalog.has(p.id));
}

/**
 * Restreint une liste de catégories/marques à celles **réellement utilisées** par les
 * produits du catalogue d'une boutique personnalisée. Quand la boutique partage tout le
 * catalogue (`catalog === null`), aucune restriction : la liste complète est renvoyée
 * (y compris les catégories/marques sans produit).
 *
 * @param taxonomies    liste complète (catégories ou marques) de l'entreprise
 * @param storeProducts produits DÉJÀ filtrés par le catalogue de la boutique
 * @param pickId        extrait l'id de taxonomie d'un produit (`p.category_id` / `p.brand_id`)
 * @param catalog       catalogue de la boutique (`null` = partage tout → pas de restriction)
 */
export function filterTaxonomyByStoreCatalog<TTax extends { id: string }, TProd>(
  taxonomies: TTax[],
  storeProducts: TProd[],
  pickId: (p: TProd) => string | null | undefined,
  catalog: Set<string> | null,
): TTax[] {
  if (!catalog) return taxonomies;
  const used = new Set<string>();
  for (const p of storeProducts) {
    const id = pickId(p);
    if (id) used.add(id);
  }
  return taxonomies.filter((t) => used.has(t.id));
}

/** IDs des produits explicitement rattachés à une boutique (gestionnaire de catalogue). */
export async function listStoreProductIds(storeId: string): Promise<Set<string>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("store_products")
    .select("product_id")
    .eq("store_id", storeId);
  if (error) throw error;
  return new Set((data ?? []).map((r) => String((r as { product_id: unknown }).product_id)));
}

/** Rattache un produit au catalogue d'une boutique (idempotent). */
export async function addProductToStore(
  companyId: string,
  storeId: string,
  productId: string,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("store_products")
    .upsert(
      { company_id: companyId, store_id: storeId, product_id: productId },
      { onConflict: "store_id,product_id", ignoreDuplicates: true },
    );
  if (error) throw error;
}

/** Retire un produit du catalogue d'une boutique. */
export async function removeProductFromStore(
  storeId: string,
  productId: string,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("store_products")
    .delete()
    .eq("store_id", storeId)
    .eq("product_id", productId);
  if (error) throw error;
}

/** Remplace tout le catalogue personnalisé d'une boutique par l'ensemble fourni. */
export async function replaceStoreCatalog(
  companyId: string,
  storeId: string,
  productIds: string[],
): Promise<void> {
  const supabase = createClient();
  const { error: delErr } = await supabase
    .from("store_products")
    .delete()
    .eq("store_id", storeId);
  if (delErr) throw delErr;
  if (productIds.length === 0) return;
  const rows = productIds.map((product_id) => ({
    company_id: companyId,
    store_id: storeId,
    product_id,
  }));
  const { error } = await supabase
    .from("store_products")
    .upsert(rows, { onConflict: "store_id,product_id", ignoreDuplicates: true });
  if (error) throw error;
}
