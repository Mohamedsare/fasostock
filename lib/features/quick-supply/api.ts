"use client";

import { createClient } from "@/lib/supabase/client";
import { fetchAllPages } from "@/lib/supabase/fetch-all-pages";
import { fetchByChunks } from "@/lib/supabase/fetch-by-chunks";
import { fetchStoreCatalog } from "@/lib/features/stores/store-catalog";
import type {
  CreateQuickSupplyInput,
  QuickSupply,
  QuickSupplyLine,
  SupplyProduct,
} from "./types";

function toNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Catalogue de saisie : ce que le réceptionnaire peut faire entrer, avec son stock.
 *
 * Volontairement plus maigre que `listProducts` (pas d'images, pas de conditionnements,
 * pas de catégories) : cette page s'ouvre sur un téléphone, debout, avec la marchandise
 * dans les bras — chaque kilo-octet est une seconde d'attente.
 *
 * Paginé (`fetchAllPages`) : au-delà de 1000 références, une lecture non paginée serait
 * tronquée EN SILENCE et l'article introuvable se ferait recréer en double au catalogue.
 */
export async function fetchSupplyCatalog(params: {
  companyId: string;
  storeId: string;
}): Promise<SupplyProduct[]> {
  const supabase = createClient();

  const [{ data: rows, error }, stockByProduct, catalog] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase
        .from("products")
        .select("id, name, unit, barcode, search_aliases, purchase_price, sale_price, product_scope, is_active")
        .eq("company_id", params.companyId)
        .is("deleted_at", null)
        .order("name", { ascending: true })
        // Deux produits peuvent porter le même nom : sans cette seconde clé, l'ordre
        // n'est pas total et une page pourrait répéter une ligne en en perdant une autre.
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchStoreInventoryMap(params.storeId),
    fetchStoreCatalog(params.storeId),
  ]);
  if (error) throw error;

  const allowed = catalog == null ? null : new Set(catalog);

  return ((rows ?? []) as Array<Record<string, unknown>>)
    .filter((r) => {
      if (r.is_active === false) return false;
      const scope = String(r.product_scope ?? "both");
      // Un article réservé au dépôt entre par le Magasin, pas par la boutique.
      if (scope !== "both" && scope !== "boutique_only") return false;
      return allowed == null || allowed.has(String(r.id));
    })
    .map((r) => {
      const id = String(r.id);
      const aliasesRaw = r.search_aliases;
      return {
        id,
        name: String(r.name ?? ""),
        unit: String(r.unit ?? "pce"),
        barcode: r.barcode != null && String(r.barcode).trim() !== "" ? String(r.barcode) : null,
        searchAliases: Array.isArray(aliasesRaw)
          ? aliasesRaw.map((a) => String(a ?? "").trim()).filter((a) => a.length > 0)
          : [],
        purchasePrice: toNum(r.purchase_price),
        salePrice: toNum(r.sale_price),
        stock: stockByProduct[id] ?? 0,
      } satisfies SupplyProduct;
    });
}

async function fetchStoreInventoryMap(storeId: string): Promise<Record<string, number>> {
  const supabase = createClient();
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
    m[String((row as { product_id: unknown }).product_id)] = toNum(
      (row as { quantity?: unknown }).quantity,
    );
  }
  return m;
}

/**
 * Enregistre l'arrivage. Tout passe par le RPC : lui seul fait l'entrée de stock, les
 * mouvements tracés, la mise à jour du coût et la création des produits manquants dans
 * une seule transaction — donc « c'est entré » veut dire que tout est entré.
 */
export async function createQuickSupply(
  input: CreateQuickSupplyInput,
): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_quick_supply", {
    p_company_id: input.companyId,
    p_store_id: input.storeId,
    p_items: input.items.map((it) => ({
      product_id: it.productId,
      label: it.label,
      unit: it.unit ?? null,
      barcode: it.barcode ?? null,
      quantity: it.quantity,
      purchase_price: it.purchasePrice,
      sale_price: it.salePrice,
    })),
    p_supplier_label: input.supplierLabel,
    // `null` (et non 0) veut dire « payé comptant » : la base retient alors le coût
    // total. Un 0 signifierait « rien payé », ce qui n'est pas la même chose.
    p_amount_paid: input.amountPaid,
    p_note: input.note,
    p_client_request_id: input.clientRequestId,
  });
  if (error) throw error;
  return String(data);
}

/**
 * Historique des arrivages — c'est l'écran de contrôle du propriétaire : qui a fait
 * entrer quoi, à quel prix, et ce que ce prix était avant.
 */
export async function listQuickSupplies(params: {
  companyId: string;
  /** `null` = toutes les boutiques de l'utilisateur. */
  storeId: string | null;
  limit?: number;
}): Promise<QuickSupply[]> {
  const supabase = createClient();
  const limit = params.limit ?? 30;

  let q = supabase
    .from("quick_supplies")
    .select(
      "id, supply_number, store_id, supplier_label, note, total_cost, amount_paid, line_count, unit_count, created_at, created_by",
    )
    .eq("company_id", params.companyId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (params.storeId) q = q.eq("store_id", params.storeId);

  const { data: rows, error } = await q;
  if (error) throw error;

  const supplies = (rows ?? []) as Array<Record<string, unknown>>;
  if (supplies.length === 0) return [];

  const ids = supplies.map((r) => String(r.id));
  const authorIds = [
    ...new Set(supplies.map((r) => (r.created_by ? String(r.created_by) : "")).filter(Boolean)),
  ];
  const storeIds = [...new Set(supplies.map((r) => String(r.store_id)))];

  const [items, names, storeNames] = await Promise.all([
    fetchByChunks(ids, async (chunk, from, to) => {
      const { data, error: iErr } = await supabase
        .from("quick_supply_items")
        .select(
          "id, supply_id, label, quantity, purchase_price, previous_purchase_price, sale_price, previous_sale_price, product_created, position",
        )
        .in("supply_id", chunk)
        .order("supply_id", { ascending: true })
        .order("position", { ascending: true })
        .range(from, to);
      if (iErr) throw iErr;
      return (data ?? []) as Array<Record<string, unknown>>;
    }),
    fetchAuthorNames(authorIds),
    fetchStoreNames(storeIds),
  ]);

  const linesBySupply = new Map<string, QuickSupplyLine[]>();
  for (const it of items) {
    const key = String(it.supply_id);
    const list = linesBySupply.get(key) ?? [];
    list.push({
      id: String(it.id),
      label: String(it.label ?? ""),
      quantity: toNum(it.quantity),
      purchasePrice: toNum(it.purchase_price),
      previousPurchasePrice:
        it.previous_purchase_price == null ? null : toNum(it.previous_purchase_price),
      salePrice: it.sale_price == null ? null : toNum(it.sale_price),
      previousSalePrice:
        it.previous_sale_price == null ? null : toNum(it.previous_sale_price),
      productCreated: it.product_created === true,
    });
    linesBySupply.set(key, list);
  }

  return supplies.map((r) => {
    const id = String(r.id);
    const createdBy = r.created_by ? String(r.created_by) : null;
    return {
      id,
      supplyNumber: String(r.supply_number ?? ""),
      storeId: String(r.store_id),
      storeName: storeNames.get(String(r.store_id)) ?? null,
      supplierLabel: r.supplier_label ? String(r.supplier_label) : null,
      note: r.note ? String(r.note) : null,
      totalCost: toNum(r.total_cost),
      amountPaid: toNum(r.amount_paid),
      lineCount: toNum(r.line_count),
      unitCount: toNum(r.unit_count),
      createdAt: String(r.created_at),
      createdBy,
      createdByName: createdBy ? (names.get(createdBy) ?? null) : null,
      lines: linesBySupply.get(id) ?? [],
    } satisfies QuickSupply;
  });
}

async function fetchAuthorNames(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", userIds);
  if (error) return new Map();
  const m = new Map<string, string>();
  for (const p of data ?? []) {
    const row = p as { id: string; full_name?: string | null };
    const name = (row.full_name ?? "").trim();
    if (name) m.set(String(row.id), name);
  }
  return m;
}

async function fetchStoreNames(storeIds: string[]): Promise<Map<string, string>> {
  if (storeIds.length === 0) return new Map();
  const supabase = createClient();
  const { data, error } = await supabase.from("stores").select("id, name").in("id", storeIds);
  if (error) return new Map();
  const m = new Map<string, string>();
  for (const s of data ?? []) {
    const row = s as { id: string; name?: string | null };
    m.set(String(row.id), String(row.name ?? ""));
  }
  return m;
}

/** Propriétaire : ouvre ou ferme le module Approvisionnement pour l'entreprise. */
export async function setQuickSupplyEnabled(
  companyId: string,
  enabled: boolean,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("company_set_quick_supply_enabled", {
    p_company_id: companyId,
    p_enabled: enabled,
  });
  if (error) throw error;
}
