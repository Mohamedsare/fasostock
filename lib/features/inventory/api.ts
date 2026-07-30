"use client";

import { enqueueOutbox } from "@/lib/db/dexie-db";
import { notifyCompanyOwnersPush } from "@/lib/features/push/company-owners-push-client";
import { listCategories, listProducts, listStoreInventory } from "@/lib/features/products/api";
import { firstProductImageUrl } from "@/lib/features/products/product-images";
import { createClient } from "@/lib/supabase/client";
import type { InventoryRow, InventoryScreenData, InventoryStatus, StockMovementRow } from "./types";

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

import {
  effectiveStockAlertThreshold,
  isBoutiqueProductScope,
  isLowStockAlert,
  parseDefaultStockAlertThreshold,
} from "@/lib/features/inventory/stock-alert-rules";

function computeStatus(availableQuantity: number, alertThreshold: number): InventoryStatus {
  if (availableQuantity <= 0) return "out";
  if (isLowStockAlert(availableQuantity, alertThreshold)) return "low";
  return "ok";
}

async function fetchDefaultStockAlertThreshold(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
): Promise<number> {
  const { data } = await supabase
    .from("company_settings")
    .select("value")
    .eq("company_id", companyId)
    .eq("key", "default_stock_alert_threshold")
    .maybeSingle();
  if (!data) return 5;
  return parseDefaultStockAlertThreshold((data as { value?: unknown }).value);
}

async function fetchStockMinOverrides(
  supabase: ReturnType<typeof createClient>,
  storeId: string,
): Promise<Map<string, number | null>> {
  const { data, error } = await supabase
    .from("product_store_settings")
    .select("product_id, stock_min_override")
    .eq("store_id", storeId);
  if (error) throw error;
  const m = new Map<string, number | null>();
  for (const row of data ?? []) {
    const o = row as { product_id?: string; stock_min_override?: number | null };
    if (o.product_id) {
      m.set(
        String(o.product_id),
        o.stock_min_override != null ? Number(o.stock_min_override) : null,
      );
    }
  }
  return m;
}

export async function fetchInventoryScreenData(params: {
  companyId: string;
  storeId: string | null;
}): Promise<InventoryScreenData> {
  const supabase = createClient();
  const [products, categories, stockMap, defaultThreshold] = await Promise.all([
    listProducts(params.companyId),
    listCategories(params.companyId),
    listStoreInventory(params.storeId),
    params.companyId
      ? fetchDefaultStockAlertThreshold(supabase, params.companyId)
      : Promise.resolve(5),
  ]);

  const categoryById = new Map<string, string>();
  for (const c of categories) categoryById.set(c.id, c.name);

  const overrideMap =
    params.storeId != null ? await fetchStockMinOverrides(supabase, params.storeId) : new Map<string, number | null>();

  const boutiqueProducts = products.filter(
    (p) => p.is_active !== false && isBoutiqueProductScope(p.product_scope ?? undefined),
  );

  const rows: InventoryRow[] = boutiqueProducts.map((p) => {
    const quantity = params.storeId ? (stockMap[p.id] ?? 0) : 0;
    const reservedQuantity = 0;
    const availableQuantity = quantity - reservedQuantity;
    const stockMin = typeof p.stock_min === "number" ? p.stock_min : toNum(p.stock_min);
    const override = overrideMap.get(p.id);
    const alertThreshold = effectiveStockAlertThreshold(
      stockMin,
      override ?? null,
      defaultThreshold,
    );
    const status = computeStatus(availableQuantity, alertThreshold);

    return {
      productId: p.id,
      imageUrl: firstProductImageUrl(p),
      name: p.name,
      sku: p.sku ?? null,
      barcode: p.barcode ?? null,
      categoryId: p.category_id ?? null,
      unit: p.unit ?? "pce",
      purchasePrice: toNum(p.purchase_price),
      salePrice: toNum(p.sale_price),
      categoryName:
        p.category?.name ?? (p.category_id ? categoryById.get(p.category_id) ?? null : null),
      brandName: p.brand?.name ?? null,
      stockMin,
      alertThreshold,
      quantity,
      reservedQuantity,
      availableQuantity,
      status,
    };
  });

  /** Flutter `_lowStock` : seuil > 0 et qté <= seuil (inclut la rupture). */
  const lowStockCount = rows.filter((r) =>
    isLowStockAlert(r.availableQuantity, r.alertThreshold),
  ).length;
  const outOfStockCount = rows.filter((r) => r.availableQuantity <= 0).length;

  let stockValuePurchase = 0;
  let stockValueSale = 0;
  for (const r of rows) {
    stockValuePurchase += r.availableQuantity * r.purchasePrice;
    stockValueSale += r.availableQuantity * r.salePrice;
  }

  const stats = {
    totalProducts: rows.length,
    lowStockCount,
    outOfStockCount,
    stockValuePurchase,
    stockValueSale,
  };

  return { rows, stats, defaultThreshold, categories };
}

/** Met à jour le seuil d'alerte société (clé `default_stock_alert_threshold`). */
export async function setDefaultStockAlertThreshold(params: {
  companyId: string;
  value: number;
}): Promise<void> {
  if (params.value < 0) throw new Error("Le seuil doit être ≥ 0.");
  const supabase = createClient();
  const { data: existing } = await supabase
    .from("company_settings")
    .select("id")
    .eq("company_id", params.companyId)
    .eq("key", "default_stock_alert_threshold")
    .maybeSingle();
  if (existing) {
    const { error } = await supabase
      .from("company_settings")
      .update({ value: params.value })
      .eq("company_id", params.companyId)
      .eq("key", "default_stock_alert_threshold");
    if (error) throw error;
  } else {
    const { error } = await supabase.from("company_settings").insert({
      company_id: params.companyId,
      key: "default_stock_alert_threshold",
      value: params.value,
    });
    if (error) throw error;
  }
}

/**
 * Une page de l'historique des mouvements, la plus récente d'abord.
 *
 * PERF — deux pièges évités, ils provoquaient un `statement timeout` (57014) sur
 * les boutiques à fort volume :
 *  1. pas de `count: "exact"` : PostgREST exécutait alors un COUNT sur TOUT
 *     l'historique de la boutique, avec la policy RLS évaluée ligne à ligne, à
 *     chaque page. On détecte « il y a une page suivante » en demandant une
 *     ligne de plus (`limit + 1`) — coût nul.
 *  2. le tri s'appuie sur l'index composite `(store_id, created_at DESC)`
 *     (migration 00161).
 *
 * `search` filtre sur le nom du produit côté serveur (jointure interne) : sans
 * cela, chercher un produit imposerait de tout télécharger pour filtrer dans le
 * navigateur.
 */
export async function listStockMovements(params: {
  storeId: string | null;
  limit: number;
  offset: number;
  search?: string;
}): Promise<{ rows: StockMovementRow[]; hasMore: boolean }> {
  if (!params.storeId) return { rows: [], hasMore: false };
  const supabase = createClient();

  const needle = (params.search ?? "").trim();
  // `!inner` : la jointure devient filtrante (obligatoire pour filtrer sur
  // `product.name`) — sinon PostgREST ignore le critère sur la table liée.
  const productJoin = needle ? "product:products!inner(name)" : "product:products(name)";

  let q = supabase
    .from("stock_movements")
    .select(`id, product_id, type, quantity, notes, created_at, ${productJoin}`)
    .eq("store_id", params.storeId)
    .order("created_at", { ascending: false })
    .range(params.offset, params.offset + params.limit); // limit + 1 ligne

  if (needle) {
    // `%` et `,` casseraient la syntaxe de filtre PostgREST.
    q = q.ilike("product.name", `%${needle.replace(/[%,]/g, " ")}%`);
  }

  const { data, error } = await q;
  if (error) throw error;

  const raw = data ?? [];
  const hasMore = raw.length > params.limit;
  const rows: StockMovementRow[] = raw.slice(0, params.limit).map((r) => {
    const productRaw = (r as unknown as { product?: { name?: string } | { name?: string }[] })
      .product;
    const productName = Array.isArray(productRaw)
      ? String(productRaw[0]?.name ?? "")
      : String(productRaw?.name ?? "");
    return {
      id: String((r as { id: string }).id),
      productId: String((r as { product_id: string }).product_id),
      productName,
      type: String((r as { type: string }).type),
      quantity: toNum((r as { quantity: unknown }).quantity),
      notes: ((r as { notes?: string | null }).notes ?? null) as string | null,
      createdAt: String((r as { created_at: string }).created_at),
    };
  });

  return { rows, hasMore };
}

export async function adjustStockAtomic(params: {
  storeId: string;
  productId: string;
  delta: number;
  reason: string;
}): Promise<void> {
  const supabase = createClient();

  if (!navigator.onLine) {
    await enqueueOutbox("inventory_adjust_atomic", params);
    return;
  }

  const {
    data: { user },
    error: uErr,
  } = await supabase.auth.getUser();
  if (uErr) throw uErr;
  if (!user) throw new Error("Non authentifié");

  const { error } = await supabase.rpc("inventory_adjust_atomic", {
    p_store_id: params.storeId,
    p_product_id: params.productId,
    p_delta: Math.trunc(params.delta),
    p_reason: params.reason,
    p_created_by: user.id,
  });
  if (error) throw error;

  const { data: inv, error: invErr } = await supabase
    .from("store_inventory")
    .select("quantity, product:products(name), store:stores(company_id)")
    .eq("store_id", params.storeId)
    .eq("product_id", params.productId)
    .maybeSingle();
  if (invErr || !inv) return;
  const qty = Number((inv as { quantity?: unknown }).quantity ?? 0);
  if (qty > 0) return;
  const st = (inv as { store?: { company_id?: string } | { company_id?: string }[] }).store;
  const companyId = Array.isArray(st) ? st[0]?.company_id : st?.company_id;
  if (!companyId) return;
  const pr = (inv as { product?: { name?: string } | { name?: string }[] }).product;
  const nm = Array.isArray(pr) ? pr[0]?.name : pr?.name;
  const label = String(nm ?? "Produit").trim() || "Produit";
  void notifyCompanyOwnersPush({
    companyIds: [companyId],
    title: "Rupture de stock",
    body: `${label} est en rupture dans cette boutique.`,
    url: "/inventory",
  });
}
