/**
 * Notifications « owner » (top bar) — même logique que Flutter
 * `owner_notifications_dialog.dart` / `owner_notifications_provider.dart`.
 */
"use client";

import { createClient } from "@/lib/supabase/client";
import { listProducts, listStoreInventory } from "@/lib/features/products/api";
import { listPurchases } from "@/lib/features/purchases/api";
import { listSales } from "@/lib/features/sales/api";
import { formatCurrency } from "@/lib/utils/currency";
import { format, subDays } from "date-fns";

export type OwnerNotificationKind =
  | "stockout"
  | "underMinStock"
  | "topSalesToday"
  | "massiveStockEntry"
  | "productsNotSoldMonths"
  | "top10ProductsSold"
  | "trendsAi";

export type OwnerNotificationItem = {
  id: string;
  kind: OwnerNotificationKind;
  title: string;
  subtitle: string;
  trailing: string | null;
};

function isBoutiqueScope(scope: string | null | undefined): boolean {
  const s = scope ?? "both";
  return s === "both" || s === "boutique_only";
}

function toEndOfDay(d: string): string {
  return `${d}T23:59:59.999Z`;
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
  const raw = (data as { value?: unknown }).value;
  if (typeof raw === "number" && raw >= 0) return Math.trunc(raw);
  if (typeof raw === "string") {
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n) && n >= 0) return n;
  }
  return 5;
}

async function fetchStockMinOverridesMap(
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

function effectiveMin(productStockMin: number, override: number | null | undefined, defaultThreshold: number): number {
  const base = override != null ? override : productStockMin;
  return base > 0 ? base : defaultThreshold;
}

function computeWeeklyTrend(
  sales: Array<{ status: string; created_at: string; total: number }>,
): { label: string; subtitle: string; trailing: string | null } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const completed = sales.filter((s) => s.status === "completed");

  const thisWeekStart = new Date(today);
  thisWeekStart.setDate(thisWeekStart.getDate() - 6);
  const lastWeekStart = new Date(today);
  lastWeekStart.setDate(lastWeekStart.getDate() - 13);
  const lastWeekEnd = new Date(today);
  lastWeekEnd.setDate(lastWeekEnd.getDate() - 7);

  let totalThisWeek = 0;
  let totalLastWeek = 0;

  for (const s of completed) {
    const d = new Date(s.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const saleDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (saleDate < thisWeekStart) {
      if (saleDate >= lastWeekStart && saleDate <= lastWeekEnd) {
        totalLastWeek += s.total;
      }
    } else {
      if (saleDate <= today) totalThisWeek += s.total;
    }
  }

  if (totalLastWeek === 0) {
    if (totalThisWeek > 0) {
      return {
        label: "Progression",
        subtitle:
          "Par rapport à la semaine précédente : vous êtes en progression (nouvelle activité).",
        trailing: formatCurrency(totalThisWeek),
      };
    }
    return {
      label: "Stable",
      subtitle:
        "Par rapport à la semaine précédente : pas encore assez de données pour la tendance.",
      trailing: null,
    };
  }

  const deltaPercent = ((totalThisWeek - totalLastWeek) / totalLastWeek) * 100;
  if (deltaPercent > 0) {
    return {
      label: "Progression",
      subtitle: "Par rapport à la semaine précédente : vous êtes en progression.",
      trailing: `+${deltaPercent.toFixed(1)} %`,
    };
  }
  if (deltaPercent < 0) {
    return {
      label: "Régression",
      subtitle: "Par rapport à la semaine précédente : vous êtes en régression.",
      trailing: `${deltaPercent.toFixed(1)} %`,
    };
  }
  return {
    label: "Stable",
    subtitle: "Par rapport à la semaine précédente : chiffre d'affaires stable.",
    trailing: "0 %",
  };
}

async function fetchSalesIdsInRange(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  storeId: string | null,
  fromDate: string,
  toDate: string,
): Promise<string[]> {
  let q = supabase
    .from("sales")
    .select("id")
    .eq("company_id", companyId)
    .eq("status", "completed")
    .gte("created_at", `${fromDate}T00:00:00.000Z`)
    .lte("created_at", toEndOfDay(toDate));
  if (storeId) q = q.eq("store_id", storeId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => (r as { id: string }).id);
}

async function fetchSaleItemsForSaleIds(
  supabase: ReturnType<typeof createClient>,
  saleIds: string[],
): Promise<Array<{ product_id: string; quantity: number }>> {
  if (saleIds.length === 0) return [];
  const chunkSize = 120;
  const out: Array<{ product_id: string; quantity: number }> = [];
  for (let i = 0; i < saleIds.length; i += chunkSize) {
    const chunk = saleIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("sale_items")
      .select("product_id, quantity")
      .in("sale_id", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      const m = row as { product_id?: string; quantity?: number };
      if (m.product_id) {
        out.push({ product_id: String(m.product_id), quantity: Number(m.quantity ?? 0) });
      }
    }
  }
  return out;
}

async function fetchEarliestMovementByProduct(
  supabase: ReturnType<typeof createClient>,
  storeId: string,
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("stock_movements")
    .select("product_id, created_at")
    .eq("store_id", storeId);
  if (error) throw error;
  const m = new Map<string, string>();
  for (const row of data ?? []) {
    const r = row as { product_id?: string; created_at?: string };
    const pid = r.product_id;
    const ca = r.created_at;
    if (!pid || !ca) continue;
    const prev = m.get(pid);
    if (!prev || ca < prev) m.set(pid, ca);
  }
  return m;
}

export type OwnerNotificationsPayload = {
  items: OwnerNotificationItem[];
};

/**
 * Charge les données et construit la liste des notifications owner (comme Flutter).
 */
export async function fetchOwnerNotificationsData(params: {
  companyId: string;
  storeId: string | null;
}): Promise<OwnerNotificationsPayload> {
  const { companyId, storeId } = params;
  const supabase = createClient();

  if (!storeId) {
    const trendOnly = computeWeeklyTrend([]);
    return {
      items: [
        {
          id: "trends_ai",
          kind: "trendsAi",
          title: `Tendances (IA) — ${trendOnly.label}`,
          subtitle: trendOnly.subtitle,
          trailing: trendOnly.trailing,
        },
      ],
    };
  }

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const from60 = format(subDays(new Date(), 60), "yyyy-MM-dd");
  const from30 = format(subDays(new Date(), 30), "yyyy-MM-dd");

  const [
    products,
    stockMap,
    defaultThreshold,
    overrideMap,
    salesWide,
    purchasesToday,
    saleIds30,
    earliestInStore,
  ] = await Promise.all([
    listProducts(companyId),
    listStoreInventory(storeId),
    fetchDefaultStockAlertThreshold(supabase, companyId),
    fetchStockMinOverridesMap(supabase, storeId),
    listSales({
      companyId,
      storeId: null,
      status: "completed",
      from: from60,
      to: todayStr,
    }),
    listPurchases({
      companyId,
      storeId: null,
      supplierId: null,
      status: null,
      from: todayStr,
      to: todayStr,
    }),
    fetchSalesIdsInRange(supabase, companyId, null, from30, todayStr),
    fetchEarliestMovementByProduct(supabase, storeId),
  ]);

  const saleItems30 = await fetchSaleItemsForSaleIds(supabase, saleIds30);
  const qtyByProduct = new Map<string, number>();
  for (const it of saleItems30) {
    qtyByProduct.set(it.product_id, (qtyByProduct.get(it.product_id) ?? 0) + it.quantity);
  }
  const productIdsSold = new Set(qtyByProduct.keys());
  const top10Sold = [...qtyByProduct.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([productId, quantity]) => ({ productId, quantity }));

  const boutiqueProducts = products.filter(
    (p) => p.is_active !== false && isBoutiqueScope(p.product_scope ?? undefined),
  );

  const items: OwnerNotificationItem[] = [];

  const stockouts = boutiqueProducts.filter((p) => (stockMap.get(p.id) ?? 0) <= 0);
  if (stockouts.length > 0) {
    items.push({
      id: "stockout",
      kind: "stockout",
      title: "Ruptures de stock",
      subtitle: `${stockouts.length} produit(s) en rupture dans la boutique actuelle.`,
      trailing: String(stockouts.length),
    });
  }

  const underMin = boutiqueProducts.filter((p) => {
    const qty = stockMap.get(p.id) ?? 0;
    if (qty <= 0) return false;
    const min = effectiveMin(
      typeof p.stock_min === "number" ? p.stock_min : Number(p.stock_min ?? 0),
      overrideMap.get(p.id),
      defaultThreshold,
    );
    return qty < min;
  });
  if (underMin.length > 0) {
    const underMinLines = underMin
      .map((p) => {
        const qty = stockMap.get(p.id) ?? 0;
        const min = effectiveMin(
          typeof p.stock_min === "number" ? p.stock_min : Number(p.stock_min ?? 0),
          overrideMap.get(p.id),
          defaultThreshold,
        );
        return `• ${p.name} : Stock ${qty} / minimum ${min}`;
      })
      .join("\n");
    items.push({
      id: "under_min_stock",
      kind: "underMinStock",
      title: "Sous le minimum (alertes)",
      subtitle: underMinLines,
      trailing: String(underMin.length),
    });
  }

  const salesToday = salesWide.filter((s) => {
    const day = (s.created_at ?? "").slice(0, 10);
    return day === todayStr;
  });
  salesToday.sort((a, b) => b.total - a.total);
  const topSales = salesToday.slice(0, 5);
  if (topSales.length > 0) {
    items.push({
      id: "top_sales_today",
      kind: "topSalesToday",
      title: "Plus grosses factures du jour",
      subtitle:
        topSales.length === 1
          ? `1 vente : ${formatCurrency(topSales[0]!.total)}`
          : `Top ${topSales.length} : ${formatCurrency(topSales[0]!.total)} max.`,
      trailing: formatCurrency(topSales[0]!.total),
    });
  }

  const massiveThreshold = 50_000;
  const purchasesTodayFiltered = purchasesToday.filter((p) => {
    if (p.status === "cancelled" || p.status === "draft") return false;
    const d = new Date(p.createdAt);
    if (Number.isNaN(d.getTime())) return false;
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate() &&
      p.total >= massiveThreshold
    );
  });
  if (purchasesTodayFiltered.length > 0) {
    const sum = purchasesTodayFiltered.reduce((s, p) => s + p.total, 0);
    items.push({
      id: "massive_stock_entry",
      kind: "massiveStockEntry",
      title: "Entrée massive de stock",
      subtitle: `${purchasesTodayFiltered.length} achat(s) aujourd'hui ≥ ${formatCurrency(massiveThreshold)}.`,
      trailing: formatCurrency(sum),
    });
  }

  const now = new Date();
  const cutoffDate = subDays(now, 30);
  const productById = new Map(boutiqueProducts.map((p) => [p.id, p]));

  const notSoldFixed = boutiqueProducts.filter((p) => {
    if (productIdsSold.has(p.id)) return false;
    const firstDateStr = earliestInStore.get(p.id);
    if (!firstDateStr) return false;
    const firstDate = new Date(firstDateStr);
    if (Number.isNaN(firstDate.getTime())) return false;
    const firstDay = new Date(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate());
    if (firstDay > cutoffDate) return false;
    return true;
  });

  if (notSoldFixed.length > 0) {
    items.push({
      id: "products_not_sold_months",
      kind: "productsNotSoldMonths",
      title: "Produits non vendus depuis 1 mois",
      subtitle: `${notSoldFixed.length} produit(s) dans cette boutique depuis au moins 30 jours, sans vente sur les 30 derniers jours.`,
      trailing: String(notSoldFixed.length),
    });
  }

  if (top10Sold.length > 0) {
    const explanation =
      "Classement des 10 produits les plus vendus. Le nombre = combien d'unités vendues en 30 jours.";
    const lines = top10Sold
      .map((e, idx) => {
        const name = productById.get(e.productId)?.name ?? "Produit";
        return `N°${idx + 1}  ${name}  =  ${e.quantity} unités vendues`;
      })
      .join("\n");
    items.push({
      id: "top_10_products_sold",
      kind: "top10ProductsSold",
      title: "Top 10 : produits qui se vendent le plus",
      subtitle: `${explanation}\n\n${lines}`,
      trailing: "10",
    });
  }

  const trend = computeWeeklyTrend(salesWide);
  items.push({
    id: "trends_ai",
    kind: "trendsAi",
    title: `Tendances (IA) — ${trend.label}`,
    subtitle: trend.subtitle,
    trailing: trend.trailing,
  });

  return { items };
}

/** Style visuel (couleur / icône) — aligné Flutter `_styleForNotification`. */
export function ownerNotificationStyle(kind: OwnerNotificationKind, trendLabel?: string | null) {
  if (kind === "trendsAi" && trendLabel) {
    if (trendLabel === "Progression")
      return {
        color: "text-emerald-700",
        border: "border-l-4 border-l-emerald-600",
        bg: "bg-emerald-500/12",
      };
    if (trendLabel === "Régression")
      return { color: "text-red-700", border: "border-l-4 border-l-red-600", bg: "bg-red-500/12" };
  }
  switch (kind) {
    case "stockout":
      return { color: "text-red-700", border: "border-l-4 border-l-red-600", bg: "bg-red-500/10" };
    case "underMinStock":
      return {
        color: "text-orange-700",
        border: "border-l-4 border-l-orange-600",
        bg: "bg-orange-500/10",
      };
    case "topSalesToday":
      return {
        color: "text-emerald-700",
        border: "border-l-4 border-l-emerald-600",
        bg: "bg-emerald-500/10",
      };
    case "massiveStockEntry":
      return { color: "text-blue-800", border: "border-l-4 border-l-blue-600", bg: "bg-blue-500/10" };
    case "productsNotSoldMonths":
      return {
        color: "text-orange-800",
        border: "border-l-4 border-l-orange-600",
        bg: "bg-orange-500/10",
      };
    case "top10ProductsSold":
      return {
        color: "text-emerald-800",
        border: "border-l-4 border-l-emerald-600",
        bg: "bg-emerald-500/10",
      };
    case "trendsAi":
    default:
      return {
        color: "text-neutral-700",
        border: "border-l-4 border-l-neutral-500",
        bg: "bg-neutral-500/10",
      };
  }
}
