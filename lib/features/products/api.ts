"use client";

import { enqueueOutbox } from "@/lib/db/dexie-db";
import { createClient } from "@/lib/supabase/client";
import { fetchAllPages } from "@/lib/supabase/fetch-all-pages";
import { compressImageForUpload } from "@/lib/utils/image-compress";
import { safeImageExtension } from "@/lib/utils/image-file";
import { FULL_SUFFIX, THUMB_SUFFIX } from "@/lib/utils/product-thumb-url";
import type {
  ProductBrand,
  ProductCategory,
  ProductFormInput,
  ProductImageRow,
  ProductItem,
  ProductPackaging,
} from "./types";
import { normalizeSearchAliases, productSearchAliases } from "./search-aliases";
import { isColumnBackedActivityFieldKey } from "@/lib/features/activity/activity-config";

const productSelectBase =
  "id, company_id, name, search_aliases, sku, barcode, unit, purchase_price, sale_price, wholesale_price, wholesale_qty, stock_min, description, is_active, category_id, brand_id, product_scope, dci, dosage_form, therapeutic_class, laboratory, prescription_required, storage_conditions, category:categories(id, name), brand:brands(id, name), product_images(id, product_id, url, position), product_packagings(id, product_id, label, barcode, factor, price, position)";

/**
 * `activity_attributes` (migration 00189) porte les champs métier des activités
 * autres que la pharmacie. Tant que la migration n'est pas appliquée, la colonne
 * n'existe pas : la demander ferait échouer TOUTE la lecture du catalogue (donc
 * la caisse). On l'interroge donc de façon optimiste, et on rebascule
 * définitivement sur l'ancien SELECT à la première erreur « colonne inconnue ».
 */
let activityAttributesColumnAvailable = true;

/**
 * `awaiting_pricing` (migration 00210) — même parade, même raison. Suivi séparément :
 * les deux migrations n'arrivent pas ensemble, et une base à jour de l'une mais pas de
 * l'autre ne doit pas perdre les deux colonnes.
 */
let awaitingPricingColumnAvailable = true;

/**
 * L'erreur dit-elle « colonne inconnue » ?
 *
 * `42703` = verdict de Postgres ; `PGRST204` = refus de PostgREST sur la foi de son
 * cache de schéma (donc possiblement transitoire, le temps qu'il recharge après un
 * `db push`). Le repli sur le message couvre les variantes de formulation.
 */
function isUndefinedColumnError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === "42703" || e.code === "PGRST204") return true;
  return (
    typeof e.message === "string" &&
    (e.message.includes("activity_attributes") || e.message.includes("awaiting_pricing"))
  );
}

/**
 * Laquelle des deux colonnes optionnelles l'erreur accuse-t-elle ?
 *
 * Postgres nomme la colonne fautive dans son message (« column products.awaiting_pricing
 * does not exist »), et c'est ce nom qu'on suit. Sans cette distinction, une seule
 * migration manquante ferait renoncer aux DEUX colonnes pour toute la session — le
 * drapeau étant un simple booléen qui ne se remet jamais à l'endroit. La page perdrait
 * alors les champs métier (00189) parce que le suivi des prix (00210) n'est pas passé,
 * sans que rien ne l'explique.
 *
 * Message muet (`42703` seul, réponse tronquée) : on ne devine pas, on retire les deux.
 * C'est le repli sûr — dégradé, jamais cassé.
 */
function undefinedColumnNames(error: unknown): {
  activityAttributes: boolean;
  awaitingPricing: boolean;
} {
  const message = (error as { message?: string } | null)?.message;
  if (typeof message === "string") {
    const activityAttributes = message.includes("activity_attributes");
    const awaitingPricing = message.includes("awaiting_pricing");
    if (activityAttributes || awaitingPricing) return { activityAttributes, awaitingPricing };
  }
  return { activityAttributes: true, awaitingPricing: true };
}

function productSelectColumns(): string {
  const extra = [
    activityAttributesColumnAvailable ? "activity_attributes" : null,
    awaitingPricingColumnAvailable ? "awaiting_pricing" : null,
  ].filter(Boolean);
  return extra.length > 0 ? `${productSelectBase}, ${extra.join(", ")}` : productSelectBase;
}

/**
 * Colonne `search_aliases` — envoyée UNIQUEMENT si le formulaire gère les autres noms
 * (fonction activée par le propriétaire). Sinon on n'écrit rien : les alias déjà
 * saisis survivent à une modification faite depuis un écran qui les ignore.
 */
function searchAliasesColumn(input: ProductFormInput): Record<string, string[]> {
  if (!input.searchAliases) return {};
  return {
    search_aliases: normalizeSearchAliases(input.searchAliases, input.name),
  };
}

/**
 * Convertit les champs métier du formulaire en colonnes SQL.
 * - clés pharmacie (00115) → leurs colonnes dédiées, comportement inchangé ;
 * - tout le reste → `activity_attributes` (JSONB, 00189), envoyé seulement s'il
 *   y a quelque chose à écrire ET si la colonne existe.
 *
 * Renvoie `{}` quand le métier n'a pas de champs spécifiques → aucune colonne
 * additionnelle envoyée (comportement historique préservé).
 */
function activityFieldColumns(
  input: ProductFormInput,
): Record<string, string | boolean | null | Record<string, string | boolean>> {
  const a = input.activityFields;
  if (!a) return {};
  const columns: Record<string, string | boolean | null> = {};
  const attributes: Record<string, string | boolean> = {};
  /** Le métier courant a-t-il au moins un champ hors colonne dédiée ? */
  let usesAttributes = false;

  for (const [key, raw] of Object.entries(a)) {
    if (isColumnBackedActivityFieldKey(key)) {
      columns[key] = typeof raw === "boolean" ? raw : raw.trim() || null;
      continue;
    }
    usesAttributes = true;
    if (typeof raw === "boolean") {
      attributes[key] = raw;
      continue;
    }
    // Champ vidé = clé absente du JSONB (et non chaîne vide) : la remise à blanc
    // d'un champ doit bien effacer la valeur enregistrée.
    const value = raw.trim();
    if (value) attributes[key] = value;
  }

  // Métier 100 % pharmacie → on n'écrit pas le JSONB (rien ne change pour lui).
  if (!usesAttributes || !activityAttributesColumnAvailable) return columns;
  return { ...columns, activity_attributes: attributes };
}

/**
 * Catalogue complet de l'entreprise.
 *
 * Paginé : c'est la lecture qui alimente la caisse. Tronquée à 1000 lignes, elle rendait
 * le 1001ᵉ produit introuvable en vente — grille ET scan de code-barres, la recherche se
 * faisant côté client sur cette liste. Une quincaillerie ou un magasin de pièces dépasse
 * 1000 références sans rien avoir d'exceptionnel.
 */
export async function listProducts(companyId: string): Promise<ProductItem[]> {
  const supabase = createClient();
  const runQuery = () =>
    fetchAllPages((from, to) =>
      supabase
        .from("products")
        .select(productSelectColumns())
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("name", { ascending: true })
        // Deux produits peuvent porter le même nom : sans cette clé, l'ordre n'est pas
        // total et une page pourrait répéter une ligne en en perdant une autre.
        .order("id", { ascending: true })
        .range(from, to),
    );

  let { data, error } = await runQuery();
  /*
   * Migration 00189 (`activity_attributes`) ou 00210 (`awaiting_pricing`) pas encore
   * appliquée : on retire LA colonne accusée et on rejoue. Sans ce repli, une base non
   * migrée n'afficherait plus aucun produit — donc plus aucune vente possible, et pour
   * tous les clients, pas seulement pour ceux qui utiliseraient la nouveauté.
   */
  // Boucle plutôt qu'un `if` : quand les DEUX migrations manquent, Postgres n'accuse
  // que la première colonne rencontrée. Un seul essai supplémentaire retomberait donc
  // sur la seconde. Deux tours au plus — il n'y a que deux colonnes optionnelles.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!error) break;
    if (!activityAttributesColumnAvailable && !awaitingPricingColumnAvailable) break;
    if (!isUndefinedColumnError(error)) break;
    const missing = undefinedColumnNames(error);
    if (missing.activityAttributes) activityAttributesColumnAvailable = false;
    if (missing.awaitingPricing) awaitingPricingColumnAvailable = false;
    ({ data, error } = await runQuery());
  }
  if (error) throw error;
  // `select()` construit dynamiquement (colonne optionnelle) → PostgREST ne peut
  // plus inférer la forme des lignes : on repasse par `unknown`.
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => {
    const categoryRaw = row.category;
    const brandRaw = row.brand;
    const category = Array.isArray(categoryRaw)
      ? (categoryRaw[0] as { id: string; name: string } | undefined) ?? null
      : ((categoryRaw as { id: string; name: string } | null) ?? null);
    const brand = Array.isArray(brandRaw)
      ? (brandRaw[0] as { id: string; name: string } | undefined) ?? null
      : ((brandRaw as { id: string; name: string } | null) ?? null);

    const imgRaw = row.product_images;
    let product_images: ProductImageRow[] | null = null;
    if (Array.isArray(imgRaw) && imgRaw.length > 0) {
      product_images = [...(imgRaw as ProductImageRow[])]
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((i) => ({
          id: String(i.id),
          product_id: i.product_id != null ? String(i.product_id) : undefined,
          url: String(i.url),
          position: Number(i.position ?? 0),
        }));
    }

    const pkgRaw = row.product_packagings;
    let product_packagings: ProductPackaging[] | null = null;
    if (Array.isArray(pkgRaw) && pkgRaw.length > 0) {
      product_packagings = [...(pkgRaw as Array<Record<string, unknown>>)]
        .map((p) => ({
          id: String(p.id),
          product_id: p.product_id != null ? String(p.product_id) : undefined,
          label: String(p.label ?? ""),
          barcode: p.barcode != null ? String(p.barcode) : null,
          factor: Math.max(1, Math.floor(Number(p.factor ?? 1))),
          price: p.price != null ? Number(p.price) : null,
          position: Number(p.position ?? 0),
        }))
        .sort((a, b) => a.position - b.position);
    }

    const base = row as unknown as ProductItem;
    return {
      ...base,
      search_aliases: productSearchAliases(base),
      wholesale_price: Number(base.wholesale_price ?? 0),
      wholesale_qty: Math.max(0, Math.floor(Number(base.wholesale_qty ?? 0))),
      category,
      brand,
      product_images,
      product_packagings,
    };
  });
}

/**
 * Tous les SKU de l'entreprise, Y COMPRIS les produits supprimés (soft-delete).
 * La suppression étant un soft-delete, la ligne (et son SKU) reste sous la
 * contrainte UNIQUE(company_id, sku). Le générateur auto doit donc connaître ces
 * SKU pour ne jamais réutiliser un numéro déjà attribué (sinon collision à la
 * création). Requête légère (colonne `sku` seule, sans filtre `deleted_at`).
 */
export async function listCompanySkus(companyId: string): Promise<string[]> {
  const supabase = createClient();
  // Paginé : un SKU manquant à la lecture serait réattribué, et l'insertion partirait
  // en violation de UNIQUE(company_id, sku) — la création de produit échouerait sans
  // que rien n'explique pourquoi.
  const { data, error } = await fetchAllPages((from, to) =>
    supabase
      .from("products")
      .select("sku")
      .eq("company_id", companyId)
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (error) throw error;
  return ((data ?? []) as Array<{ sku: string | null }>)
    .map((r) => r.sku)
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0);
}

export async function listCategories(
  companyId: string,
): Promise<ProductCategory[]> {
  const supabase = createClient();
  const { data, error } = await fetchAllPages((from, to) =>
    supabase
      .from("categories")
      .select("id, company_id, name")
      .eq("company_id", companyId)
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (error) throw error;
  return (data ?? []) as ProductCategory[];
}

export async function listBrands(companyId: string): Promise<ProductBrand[]> {
  const supabase = createClient();
  const { data, error } = await fetchAllPages((from, to) =>
    supabase
      .from("brands")
      .select("id, company_id, name")
      .eq("company_id", companyId)
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (error) throw error;
  return (data ?? []) as ProductBrand[];
}

/**
 * Stock d'une boutique, indexé par `product_id`.
 *
 * On renvoie un **objet simple** (et non un `Map`) car cette valeur transite par le cache
 * React Query, qui est persisté en IndexedDB via `JSON.stringify` : un `Map` y serait
 * sérialisé en `{}` et le stock repartirait à 0 au rechargement de la page. Même raison
 * que `fetchStoreCatalog`. Côté composant, passer par `ensureStringNumberMap()`.
 */
export async function listStoreInventory(
  storeId: string | null,
): Promise<Record<string, number>> {
  if (!storeId) return {};
  const supabase = createClient();
  // Paginé pour la même raison que `listProducts` : tronqué, le stock des produits
  // au-delà de la 1000ᵉ ligne revenait à 0 — fausses ruptures en caisse et en inventaire.
  // `product_id` est unique pour une boutique donnée : l'ordre est donc total.
  const { data, error } = await fetchAllPages((from, to) =>
    supabase
      .from("store_inventory")
      .select("product_id, quantity")
      .eq("store_id", storeId)
      .order("product_id", { ascending: true })
      .range(from, to),
  );
  if (error) throw error;
  const m: Record<string, number> = {};
  for (const row of data ?? []) {
    m[String(row.product_id)] = Number(row.quantity ?? 0);
  }
  return m;
}

export async function createProduct(
  companyId: string,
  input: ProductFormInput,
  /** Boutique courante : le produit est rattaché à son catalogue (utile si catalogue personnalisé). */
  storeId?: string | null,
): Promise<{ id: string } | undefined> {
  const payload = {
    company_id: companyId,
    name: input.name.trim(),
    sku: input.sku.trim() || null,
    barcode: input.barcode.trim() || null,
    unit: input.unit.trim() || "pce",
    purchase_price: input.purchasePrice,
    sale_price: input.salePrice,
    wholesale_price: input.wholesalePrice,
    wholesale_qty: input.wholesaleQty,
    stock_min: input.stockMin,
    description: input.description.trim() || null,
    is_active: input.isActive,
    category_id: input.categoryId || null,
    brand_id: input.brandId || null,
    product_scope: input.productScope,
    ...activityFieldColumns(input),
    ...searchAliasesColumn(input),
  };
  const supabase = createClient();
  if (!navigator.onLine) {
    await enqueueOutbox("product_create", payload);
    return undefined;
  }
  let { data, error } = await supabase.from("products").insert(payload).select("id").single();
  // Migration 00189 absente : on retire le JSONB métier et on réenregistre —
  // le produit est créé (sans ses champs métier) plutôt que perdu.
  if (error && activityAttributesColumnAvailable && isUndefinedColumnError(error)) {
    activityAttributesColumnAvailable = false;
    const { activity_attributes: _dropped, ...retryPayload } = payload as Record<string, unknown>;
    ({ data, error } = await supabase
      .from("products")
      .insert(retryPayload)
      .select("id")
      .single());
  }
  if (error) throw error;
  const id = String((data as { id: string }).id);
  // Rattache le produit au catalogue de la boutique courante (idempotent). Sans effet pour
  // les boutiques qui partagent tout le catalogue ; essentiel pour un catalogue personnalisé.
  if (storeId) {
    const { error: linkErr } = await supabase
      .from("store_products")
      .upsert(
        { company_id: companyId, store_id: storeId, product_id: id },
        { onConflict: "store_id,product_id", ignoreDuplicates: true },
      );
    // Ne bloque pas la création du produit si le rattachement échoue.
    if (linkErr) console.error("store_products link failed", linkErr);
  }
  return { id };
}

export async function updateProduct(
  id: string,
  input: ProductFormInput,
): Promise<void> {
  const patch = {
    name: input.name.trim(),
    sku: input.sku.trim() || null,
    barcode: input.barcode.trim() || null,
    unit: input.unit.trim() || "pce",
    purchase_price: input.purchasePrice,
    sale_price: input.salePrice,
    wholesale_price: input.wholesalePrice,
    wholesale_qty: input.wholesaleQty,
    stock_min: input.stockMin,
    description: input.description.trim() || null,
    category_id: input.categoryId || null,
    brand_id: input.brandId || null,
    is_active: input.isActive,
    product_scope: input.productScope,
    ...activityFieldColumns(input),
    ...searchAliasesColumn(input),
  };
  const supabase = createClient();
  if (!navigator.onLine) {
    await enqueueOutbox("product_update", { id, patch });
    return;
  }
  let { error } = await supabase.from("products").update(patch).eq("id", id);
  // Idem création : sans la migration 00189, on enregistre sans les champs métier.
  if (error && activityAttributesColumnAvailable && isUndefinedColumnError(error)) {
    activityAttributesColumnAvailable = false;
    const { activity_attributes: _dropped, ...retryPatch } = patch as Record<string, unknown>;
    ({ error } = await supabase.from("products").update(retryPatch).eq("id", id));
  }
  if (error) throw error;
}

export async function setProductActive(id: string, isActive: boolean) {
  const supabase = createClient();
  if (!navigator.onLine) {
    await enqueueOutbox("product_set_active", { id, isActive });
    return;
  }
  const { error } = await supabase
    .from("products")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) throw error;
}

export async function setProductBarcode(id: string, barcode: string) {
  const normalized = barcode.trim() || null;
  const supabase = createClient();
  if (!navigator.onLine) {
    await enqueueOutbox("product_set_barcode", { id, barcode: normalized });
    return;
  }
  const { error } = await supabase.from("products").update({ barcode: normalized }).eq("id", id);
  if (error) throw error;
}

export async function softDeleteProduct(id: string) {
  const now = new Date().toISOString();
  const supabase = createClient();
  if (!navigator.onLine) {
    await enqueueOutbox("product_soft_delete", { id, now });
    return;
  }
  const { error } = await supabase
    .from("products")
    .update({ deleted_at: now, is_active: false })
    .eq("id", id);
  if (error) throw error;
}

export async function createCategory(companyId: string, name: string): Promise<string | null> {
  const supabase = createClient();
  const payload = { company_id: companyId, name: name.trim() };
  if (!navigator.onLine) {
    await enqueueOutbox("category_create", payload);
    return null;
  }
  const { data, error } = await supabase.from("categories").insert(payload).select("id").single();
  if (error) throw error;
  return String((data as { id: string }).id);
}

export async function createBrand(companyId: string, name: string): Promise<string | null> {
  const supabase = createClient();
  const payload = { company_id: companyId, name: name.trim() };
  if (!navigator.onLine) {
    await enqueueOutbox("brand_create", payload);
    return null;
  }
  const { data, error } = await supabase.from("brands").insert(payload).select("id").single();
  if (error) throw error;
  return String((data as { id: string }).id);
}

const PRODUCT_IMAGES_BUCKET = "product-images";

/** Upload image + ligne `product_images` — aligné `ProductsRepository.addImage` (Flutter). */
export async function addProductImage(productId: string, file: File): Promise<void> {
  if (!navigator.onLine) {
    throw new Error("Hors ligne : les images seront disponibles après reconnexion.");
  }
  const supabase = createClient();
  // Une photo de téléphone (3–8 Mo) pour une miniature de 48 px : on la réduit
  // avant l'envoi. Repli sur l'original si la compression n'aboutit pas.
  const optimized = await compressImageForUpload(file, "product");
  const ext = safeImageExtension(optimized.name);
  const stamp = Date.now();

  // Vignette 256 px envoyée EN PREMIER : le suffixe `-f` de l'image principale
  // atteste de son existence (cf. `productThumbUrl`), il ne doit donc être écrit
  // qu'une fois la vignette réellement en place. Si quoi que ce soit échoue ici,
  // on retombe sur un nom sans marqueur et l'image principale est servie telle
  // quelle — dégradé, jamais cassé.
  let path = `${productId}/${stamp}.${ext}`;
  try {
    const thumb = await compressImageForUpload(file, "thumbnail");
    const thumbExt = safeImageExtension(thumb.name);
    // La dérivation d'URL ne change que le suffixe : les deux fichiers doivent
    // partager la même extension.
    if (thumbExt === ext) {
      const { error: thumbErr } = await supabase.storage
        .from(PRODUCT_IMAGES_BUCKET)
        .upload(`${productId}/${stamp}${THUMB_SUFFIX}.${thumbExt}`, thumb, {
          contentType: thumb.type || "image/webp",
          upsert: false,
        });
      if (!thumbErr) path = `${productId}/${stamp}${FULL_SUFFIX}.${ext}`;
    }
  } catch {
    /* vignette impossible : on continue sans, l'affichage reste correct */
  }

  const { error: upErr } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).upload(path, optimized, {
    contentType: optimized.type || "image/jpeg",
    upsert: false,
  });
  if (upErr) throw upErr;
  const { data: pub } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path);
  const publicUrl = pub.publicUrl;

  const { data: maxRow, error: maxErr } = await supabase
    .from("product_images")
    .select("position")
    .eq("product_id", productId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) throw maxErr;
  const pos =
    maxRow && typeof (maxRow as { position?: unknown }).position === "number"
      ? (maxRow as { position: number }).position + 1
      : 0;

  const { error: insErr } = await supabase
    .from("product_images")
    .insert({ product_id: productId, url: publicUrl, position: pos });
  if (insErr) throw insErr;
}

export async function deleteProductImage(imageId: string): Promise<void> {
  if (!navigator.onLine) {
    throw new Error("Hors ligne : suppression d'image indisponible.");
  }
  const supabase = createClient();
  const { error } = await supabase.from("product_images").delete().eq("id", imageId);
  if (error) throw error;
}

export async function updateCategory(id: string, name: string) {
  const supabase = createClient();
  if (!navigator.onLine) {
    await enqueueOutbox("category_update", { id, name: name.trim() });
    return;
  }
  const { error } = await supabase
    .from("categories")
    .update({ name: name.trim() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteCategory(id: string) {
  const supabase = createClient();
  if (!navigator.onLine) {
    await enqueueOutbox("category_delete", { id });
    return;
  }
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw error;
}

export async function updateBrand(id: string, name: string) {
  const supabase = createClient();
  if (!navigator.onLine) {
    await enqueueOutbox("brand_update", { id, name: name.trim() });
    return;
  }
  const { error } = await supabase
    .from("brands")
    .update({ name: name.trim() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteBrand(id: string) {
  const supabase = createClient();
  if (!navigator.onLine) {
    await enqueueOutbox("brand_delete", { id });
    return;
  }
  const { error } = await supabase.from("brands").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Réglage entreprise « Autres noms de produits » — écrit par le propriétaire
 * depuis Paramètres (RPC dédiée : la policy d'update sur `companies` est ouverte
 * à tous les membres, le drapeau ne l'est pas).
 */
export async function setProductAliasesEnabled(
  companyId: string,
  enabled: boolean,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("company_set_product_aliases_enabled", {
    p_company_id: companyId,
    p_enabled: enabled,
  });
  if (error) throw error;
}
