import { listProducts, listStoreInventory } from "@/lib/features/products/api";
import { fetchAllPages } from "@/lib/supabase/fetch-all-pages";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  effectiveStockAlertThreshold,
  isBoutiqueProductScope,
  isLowStockAlert,
  parseDefaultStockAlertThreshold,
} from "@/lib/features/inventory/stock-alert-rules";

export type StockAlertLine = {
  productId: string;
  productName: string;
  quantity: number;
  threshold: number;
  storeId: string;
  storeName?: string;
};

async function fetchDefaultStockAlertThreshold(
  supabase: SupabaseClient,
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
  supabase: SupabaseClient,
  storeId: string,
): Promise<Map<string, number | null>> {
  // Paginé — voir `inventory/api.ts` : une troncature fausse le compteur d'alertes.
  const { data, error } = await fetchAllPages((from, to) =>
    supabase
      .from("product_store_settings")
      .select("product_id, stock_min_override")
      .eq("store_id", storeId)
      .order("product_id", { ascending: true })
      .range(from, to),
  );
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

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Même logique que `fetchInventoryScreenData` → `stats.lowStockCount`
 * (produits boutique actifs, seuil effectif, qty depuis inventaire boutique).
 */
export async function listLowStockAlertsForStore(
  supabase: SupabaseClient,
  companyId: string,
  storeId: string,
  storeName?: string,
): Promise<StockAlertLine[]> {
  const [products, stockMap, defaultThreshold, overrideMap] = await Promise.all([
    listProducts(companyId),
    listStoreInventory(storeId),
    fetchDefaultStockAlertThreshold(supabase, companyId),
    fetchStockMinOverrides(supabase, storeId),
  ]);

  const lines: StockAlertLine[] = [];
  for (const p of products) {
    if (p.is_active === false) continue;
    if (!isBoutiqueProductScope(p.product_scope ?? undefined)) continue;

    const availableQuantity = stockMap[p.id] ?? 0;
    const stockMin = toNum(p.stock_min);
    const alertThreshold = effectiveStockAlertThreshold(
      stockMin,
      overrideMap.get(p.id) ?? null,
      defaultThreshold,
    );

    if (!isLowStockAlert(availableQuantity, alertThreshold)) continue;

    lines.push({
      productId: p.id,
      productName: p.name,
      quantity: availableQuantity,
      threshold: alertThreshold,
      storeId,
      storeName,
    });
  }

  lines.sort((a, b) => a.quantity - b.quantity);
  return lines;
}

export async function countLowStockAlerts(
  supabase: SupabaseClient,
  companyId: string,
  storeId: string | null,
): Promise<{ count: number; lines: StockAlertLine[] }> {
  if (storeId) {
    const lines = await listLowStockAlertsForStore(supabase, companyId, storeId);
    return { count: lines.length, lines };
  }

  const { data: stores, error } = await supabase
    .from("stores")
    .select("id, name")
    .eq("company_id", companyId)
    .eq("is_active", true);
  if (error) throw error;

  const allLines: StockAlertLine[] = [];
  for (const s of stores ?? []) {
    const sid = String((s as { id?: string }).id ?? "");
    if (!sid) continue;
    const name = String((s as { name?: string }).name ?? "");
    const lines = await listLowStockAlertsForStore(supabase, companyId, sid, name);
    allLines.push(...lines);
  }

  allLines.sort((a, b) => a.quantity - b.quantity);
  return { count: allLines.length, lines: allLines };
}
