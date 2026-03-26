"use client";

import { createClient } from "@/lib/supabase/client";
import { getDefaultDateRange } from "@/lib/features/dashboard/date-range";
import type {
  CategorySales,
  DashboardData,
  PurchasesSummary,
  ReportsPageData,
  SalesByDay,
  SalesSummary,
  StockMovementByDay,
  StockReportData,
  StockValue,
  TopProduct,
} from "@/lib/features/dashboard/types";
import { format } from "date-fns";
import type {
  PredictionContext,
  PurchasesSummaryForPrediction,
  SalesByDayPrediction,
  SalesSummaryForPrediction,
  TopProductPrediction,
} from "@/lib/features/ai/prediction-types";

const toEndOfDay = (d: string) => `${d}T23:59:59.999Z`;

function emptySummary(): SalesSummary {
  return { totalAmount: 0, count: 0, itemsSold: 0, margin: 0 };
}

async function fetchSalesIdsInRange(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  storeId: string | null,
  fromDate: string,
  toDate: string,
  createdBy?: string | null,
): Promise<string[]> {
  let q = supabase
    .from("sales")
    .select("id")
    .eq("company_id", companyId)
    .eq("status", "completed")
    .gte("created_at", fromDate)
    .lte("created_at", toEndOfDay(toDate));
  if (storeId) q = q.eq("store_id", storeId);
  if (createdBy) q = q.eq("created_by", createdBy);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => r.id as string);
}

async function computeSalesSummaryFromIds(
  supabase: ReturnType<typeof createClient>,
  saleIds: string[],
): Promise<SalesSummary> {
  if (saleIds.length === 0) return emptySummary();
  const { data: sales, error: sErr } = await supabase
    .from("sales")
    .select("id, total")
    .in("id", saleIds);
  if (sErr) throw sErr;
  let totalAmount = 0;
  for (const s of sales ?? []) {
    totalAmount += Number((s as { total?: number }).total ?? 0);
  }
  const { data: items, error: iErr } = await supabase
    .from("sale_items")
    .select(
      "quantity, total, product:products(id, purchase_price)",
    )
    .in("sale_id", saleIds);
  if (iErr) throw iErr;
  let itemsSold = 0;
  let margin = 0;
  for (const row of items ?? []) {
    const m = row as {
      quantity?: number;
      total?: number;
      product?: { purchase_price?: number } | null;
    };
    const qty = Number(m.quantity ?? 0);
    const lineTotal = Number(m.total ?? 0);
    const purchasePrice = Number(m.product?.purchase_price ?? 0);
    itemsSold += qty;
    margin += lineTotal - purchasePrice * qty;
  }
  return {
    totalAmount,
    count: saleIds.length,
    itemsSold,
    margin,
  };
}

function computeSalesByDay(
  sales: Array<{ created_at: string; total: number }>,
): SalesByDay[] {
  const byDay = new Map<string, { total: number; count: number }>();
  for (const s of sales) {
    const date = (s.created_at ?? "").slice(0, 10);
    if (!date) continue;
    const cur = byDay.get(date) ?? { total: 0, count: 0 };
    byDay.set(date, {
      total: cur.total + Number(s.total ?? 0),
      count: cur.count + 1,
    });
  }
  return [...byDay.entries()]
    .map(([date, v]) => ({ date, total: v.total, count: v.count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function getTopProducts(
  supabase: ReturnType<typeof createClient>,
  saleIds: string[],
  limit: number,
): Promise<TopProduct[]> {
  if (saleIds.length === 0) return [];
  const { data: items, error } = await supabase
    .from("sale_items")
    .select(
      "product_id, quantity, total, product:products(id, name, purchase_price)",
    )
    .in("sale_id", saleIds);
  if (error) throw error;
  const agg = new Map<
    string,
    { name: string; qty: number; revenue: number; cost: number }
  >();
  for (const row of items ?? []) {
    const m = row as {
      product_id?: string;
      quantity?: number;
      total?: number;
      product?: { id?: string; name?: string; purchase_price?: number } | null;
    };
    const pid = m.product_id;
    if (!pid) continue;
    const name = m.product?.name ?? "—";
    const purchasePrice = Number(m.product?.purchase_price ?? 0);
    const qty = Number(m.quantity ?? 0);
    const total = Number(m.total ?? 0);
    const cur = agg.get(pid) ?? { name, qty: 0, revenue: 0, cost: 0 };
    agg.set(pid, {
      name,
      qty: cur.qty + qty,
      revenue: cur.revenue + total,
      cost: cur.cost + purchasePrice * qty,
    });
  }
  const list = [...agg.entries()].map(([productId, v]) => ({
    productId,
    productName: v.name,
    quantitySold: v.qty,
    revenue: v.revenue,
    margin: v.revenue - v.cost,
  }));
  list.sort((a, b) => b.revenue - a.revenue);
  return list.slice(0, limit);
}

async function getSalesByCategory(
  supabase: ReturnType<typeof createClient>,
  saleIds: string[],
): Promise<CategorySales[]> {
  if (saleIds.length === 0) return [];
  const { data: items, error } = await supabase
    .from("sale_items")
    .select(
      "quantity, total, product:products(id, name, category_id, category:categories(id, name))",
    )
    .in("sale_id", saleIds);
  if (error) throw error;
  const agg = new Map<string, { name: string; revenue: number; qty: number }>();
  for (const row of items ?? []) {
    const m = row as {
      quantity?: number;
      total?: number;
      product?: {
        category_id?: string | null;
        category?: { id?: string; name?: string } | null;
      } | null;
    };
    const p = m.product;
    const cid = p?.category?.id ?? p?.category_id ?? null;
    const name =
      p?.category?.name?.trim() ||
      (cid ? "Catégorie" : "Sans catégorie");
    const key = cid ?? "__none__";
    const cur = agg.get(key) ?? { name, revenue: 0, qty: 0 };
    agg.set(key, {
      name: cur.name,
      revenue: cur.revenue + Number(m.total ?? 0),
      qty: cur.qty + Number(m.quantity ?? 0),
    });
  }
  return [...agg.entries()].map(([k, v]) => ({
    categoryId: k === "__none__" ? null : k,
    categoryName: v.name,
    revenue: v.revenue,
    quantity: v.qty,
  }));
}

async function getPurchasesSummary(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  storeId: string | null,
  fromDate: string,
  toDate: string,
): Promise<PurchasesSummary> {
  let q = supabase
    .from("purchases")
    .select("id, total")
    .eq("company_id", companyId)
    .in("status", ["confirmed", "received", "partially_received"])
    .gte("created_at", fromDate)
    .lte("created_at", toEndOfDay(toDate));
  if (storeId) q = q.eq("store_id", storeId);
  const { data, error } = await q;
  if (error) throw error;
  let totalAmount = 0;
  for (const p of data ?? []) {
    totalAmount += Number((p as { total?: number }).total ?? 0);
  }
  return { totalAmount, count: (data ?? []).length };
}

async function getStockValue(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  storeId: string | null,
): Promise<StockValue> {
  if (storeId) {
    const { data: inv, error } = await supabase
      .from("store_inventory")
      .select("product_id, quantity, product:products(id, sale_price)")
      .eq("store_id", storeId);
    if (error) throw error;
    let totalValue = 0;
    for (const row of inv ?? []) {
      const m = row as {
        quantity?: number;
        product?: { sale_price?: number } | null;
      };
      const qty = Number(m.quantity ?? 0);
      const price = Number(m.product?.sale_price ?? 0);
      totalValue += qty * price;
    }
    return { totalValue, productCount: (inv ?? []).length };
  }
  const { data: stores, error: e1 } = await supabase
    .from("stores")
    .select("id")
    .eq("company_id", companyId)
    .eq("is_active", true);
  if (e1) throw e1;
  const storeIds = (stores ?? []).map((s) => s.id as string);
  if (storeIds.length === 0) return { totalValue: 0, productCount: 0 };
  const { data: inv, error } = await supabase
    .from("store_inventory")
    .select("store_id, product_id, quantity, product:products(id, sale_price)")
    .in("store_id", storeIds);
  if (error) throw error;
  const seen = new Set<string>();
  let totalValue = 0;
  for (const row of inv ?? []) {
    const m = row as {
      store_id?: string;
      product_id?: string;
      quantity?: number;
      product?: { sale_price?: number } | null;
    };
    const qty = Number(m.quantity ?? 0);
    const price = Number(m.product?.sale_price ?? 0);
    totalValue += qty * price;
    if (m.store_id && m.product_id) {
      seen.add(`${m.store_id}-${m.product_id}`);
    }
  }
  return { totalValue, productCount: seen.size };
}

async function getLowStockCount(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  storeId: string | null,
): Promise<number> {
  let storeIds: string[];
  if (storeId) {
    storeIds = [storeId];
  } else {
    const { data: stores, error } = await supabase
      .from("stores")
      .select("id")
      .eq("company_id", companyId)
      .eq("is_active", true);
    if (error) throw error;
    storeIds = (stores ?? []).map((s) => s.id as string);
  }
  if (storeIds.length === 0) return 0;
  const { data: inv, error: invErr } = await supabase
    .from("store_inventory")
    .select("store_id, product_id, quantity, product:products(id, stock_min)")
    .in("store_id", storeIds);
  if (invErr) throw invErr;
  const { data: overrides, error: oErr } = await supabase
    .from("product_store_settings")
    .select("store_id, product_id, stock_min_override")
    .in("store_id", storeIds);
  if (oErr) throw oErr;
  const overrideMap = new Map<string, number | null>();
  for (const o of overrides ?? []) {
    const m = o as {
      store_id?: string;
      product_id?: string;
      stock_min_override?: number | null;
    };
    if (m.store_id && m.product_id) {
      overrideMap.set(
        `${m.store_id}-${m.product_id}`,
        m.stock_min_override != null
          ? Number(m.stock_min_override)
          : null,
      );
    }
  }
  const alertKeys = new Set<string>();
  for (const row of inv ?? []) {
    const m = row as {
      store_id?: string;
      product_id?: string;
      quantity?: number;
      product?: { stock_min?: number } | null;
    };
    const sid = m.store_id;
    const pid = m.product_id;
    if (!sid || !pid) continue;
    const qty = Number(m.quantity ?? 0);
    const min =
      overrideMap.get(`${sid}-${pid}`) ??
      Number(m.product?.stock_min ?? 0);
    if (qty <= min) alertKeys.add(`${sid}-${pid}`);
  }
  return alertKeys.size;
}

const CHUNK = 800;

type SaleItemRow = {
  sale_id: string;
  product_id: string;
  quantity: number;
  total: number;
  product?: {
    id?: string;
    name?: string;
    purchase_price?: number | null;
    category_id?: string | null;
    category?: { id?: string; name?: string } | null;
  } | null;
};

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

async function fetchSaleItemsForSaleIds(
  supabase: ReturnType<typeof createClient>,
  saleIds: string[],
): Promise<SaleItemRow[]> {
  if (saleIds.length === 0) return [];
  const out: SaleItemRow[] = [];
  for (let i = 0; i < saleIds.length; i += CHUNK) {
    const chunk = saleIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("sale_items")
      .select(
        "sale_id, product_id, quantity, total, product:products(id, name, purchase_price, category_id, category:categories(id, name))",
      )
      .in("sale_id", chunk);
    if (error) throw error;
    out.push(...((data ?? []) as SaleItemRow[]));
  }
  return out;
}

function filterSaleItems(
  items: SaleItemRow[],
  productId: string | null,
  categoryId: string | null,
): SaleItemRow[] {
  if (!productId && !categoryId) return items;
  return items.filter((row) => {
    if (productId && row.product_id !== productId) return false;
    if (categoryId) {
      const cid = row.product?.category_id ?? null;
      if (cid !== categoryId) return false;
    }
    return true;
  });
}

async function fetchSalesRowsChunked(
  supabase: ReturnType<typeof createClient>,
  saleIds: string[],
): Promise<Array<{ created_at: string; total: number }>> {
  if (saleIds.length === 0) return [];
  const out: Array<{ created_at: string; total: number }> = [];
  for (let i = 0; i < saleIds.length; i += CHUNK) {
    const chunk = saleIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("sales")
      .select("created_at, total")
      .in("id", chunk);
    if (error) throw error;
    out.push(...((data ?? []) as Array<{ created_at: string; total: number }>));
  }
  return out;
}

async function computeSalesSummaryFiltered(
  supabase: ReturnType<typeof createClient>,
  matchedSaleIds: string[],
  filteredItems: SaleItemRow[],
): Promise<SalesSummary> {
  if (matchedSaleIds.length === 0) return emptySummary();
  const rows: Array<{ id?: string; total?: number }> = [];
  for (let i = 0; i < matchedSaleIds.length; i += CHUNK) {
    const chunk = matchedSaleIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("sales")
      .select("id, total")
      .in("id", chunk);
    if (error) throw error;
    rows.push(...((data ?? []) as Array<{ id?: string; total?: number }>));
  }
  let totalAmount = 0;
  for (const s of rows) {
    totalAmount += Number(s.total ?? 0);
  }
  let itemsSold = 0;
  let margin = 0;
  for (const row of filteredItems) {
    const qty = Number(row.quantity ?? 0);
    const lineTotal = Number(row.total ?? 0);
    const purchasePrice = Number(row.product?.purchase_price ?? 0);
    itemsSold += qty;
    margin += lineTotal - purchasePrice * qty;
  }
  return {
    totalAmount,
    count: matchedSaleIds.length,
    itemsSold,
    margin,
  };
}

function aggregateCategoriesFromItems(
  items: SaleItemRow[],
  limit: number,
): CategorySales[] {
  const agg = new Map<string, { name: string; revenue: number; qty: number }>();
  for (const row of items) {
    const p = row.product;
    const cid = p?.category?.id ?? p?.category_id ?? null;
    const name =
      p?.category?.name?.trim() ||
      (cid ? "Catégorie" : "Sans catégorie");
    const key = cid ?? "__none__";
    const cur = agg.get(key) ?? { name, revenue: 0, qty: 0 };
    agg.set(key, {
      name: cur.name,
      revenue: cur.revenue + Number(row.total ?? 0),
      qty: cur.qty + Number(row.quantity ?? 0),
    });
  }
  return [...agg.entries()]
    .map(([k, v]) => ({
      categoryId: k === "__none__" ? null : k,
      categoryName: v.name,
      revenue: v.revenue,
      quantity: v.qty,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

function aggregateTopLeastFromItems(
  items: SaleItemRow[],
  topLimit: number,
  leastLimit: number,
): { top: TopProduct[]; least: TopProduct[] } {
  const agg = new Map<
    string,
    { name: string; qty: number; revenue: number; cost: number }
  >();
  for (const row of items) {
    const pid = row.product_id;
    if (!pid) continue;
    const name = row.product?.name ?? "—";
    const purchasePrice = Number(row.product?.purchase_price ?? 0);
    const qty = Number(row.quantity ?? 0);
    const total = Number(row.total ?? 0);
    const cur = agg.get(pid) ?? { name, qty: 0, revenue: 0, cost: 0 };
    agg.set(pid, {
      name,
      qty: cur.qty + qty,
      revenue: cur.revenue + total,
      cost: cur.cost + purchasePrice * qty,
    });
  }
  const list = [...agg.entries()].map(([productId, v]) => ({
    productId,
    productName: v.name,
    quantitySold: v.qty,
    revenue: v.revenue,
    margin: v.revenue - v.cost,
  }));
  const top = [...list]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, topLimit);
  const least = [...list]
    .sort((a, b) => a.revenue - b.revenue)
    .slice(0, leastLimit);
  return { top, least };
}

async function fetchStockReportForStore(params: {
  supabase: ReturnType<typeof createClient>;
  companyId: string;
  storeId: string;
  fromDate: string;
  toDate: string;
}): Promise<StockReportData> {
  const { supabase, companyId, storeId, fromDate, toDate } = params;
  const defaultThreshold = await fetchDefaultStockAlertThreshold(
    supabase,
    companyId,
  );
  const overrideMap = await fetchStockMinOverridesMap(supabase, storeId);

  const { data: inv, error: invErr } = await supabase
    .from("store_inventory")
    .select(
      "product_id, quantity, product:products(id, name, stock_min)",
    )
    .eq("store_id", storeId);
  if (invErr) throw invErr;

  const outOfStock: StockReportData["outOfStock"] = [];
  const lowStock: StockReportData["lowStock"] = [];

  for (const row of inv ?? []) {
    const m = row as {
      product_id?: string;
      quantity?: number;
      product?: { id?: string; name?: string; stock_min?: number } | null;
    };
    const pid = m.product_id;
    if (!pid) continue;
    const qty = Number(m.quantity ?? 0);
    const p = m.product;
    const name = p?.name ?? "—";
    const min =
      overrideMap.get(pid) ??
      Number(p?.stock_min ?? 0);
    const threshold =
      min > 0 ? min : defaultThreshold;
    if (qty <= 0) {
      outOfStock.push({
        productId: pid,
        productName: name,
        quantity: qty,
        threshold,
      });
    } else if (threshold > 0 && qty <= threshold) {
      lowStock.push({
        productId: pid,
        productName: name,
        quantity: qty,
        threshold,
      });
    }
  }
  outOfStock.sort((a, b) => a.quantity - b.quantity);
  lowStock.sort((a, b) => a.quantity - b.quantity);

  const { data: movements, error: movErr } = await supabase
    .from("stock_movements")
    .select("quantity, created_at")
    .eq("store_id", storeId)
    .gte("created_at", fromDate)
    .lte("created_at", toEndOfDay(toDate));
  if (movErr) throw movErr;

  let entries = 0;
  let exits = 0;
  const byDayNet = new Map<string, number>();
  for (const mv of movements ?? []) {
    const mm = mv as { quantity?: number; created_at?: string };
    const q = Number(mm.quantity ?? 0);
    const raw = String(mm.created_at ?? "");
    const day = raw.length >= 10 ? raw.slice(0, 10) : raw;
    if (q >= 0) entries += q;
    else exits += Math.abs(q);
    byDayNet.set(day, (byDayNet.get(day) ?? 0) + q);
  }
  const byDayNetList: StockMovementByDay[] = [...byDayNet.entries()]
    .map(([date, netQuantity]) => ({ date, netQuantity }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const net = entries - exits;

  return {
    currentStockCount: (inv ?? []).length,
    outOfStock,
    lowStock,
    entries,
    exits,
    net,
    byDayNet: byDayNetList,
  };
}

/** Rapports — filtres caissier / produit / catégorie, top 10 + moins vendus, bloc stock boutique. */
export async function fetchReportsPageData(params: {
  companyId: string;
  storeId: string | null;
  fromDate: string;
  toDate: string;
  cashierUserId: string | null;
  productId: string | null;
  categoryId: string | null;
}): Promise<ReportsPageData> {
  const supabase = createClient();
  const {
    companyId,
    storeId,
    fromDate,
    toDate,
    cashierUserId,
    productId,
    categoryId,
  } = params;

  const saleIds = await fetchSalesIdsInRange(
    supabase,
    companyId,
    storeId,
    fromDate,
    toDate,
    cashierUserId,
  );
  const allItems = await fetchSaleItemsForSaleIds(supabase, saleIds);
  const filteredItems = filterSaleItems(allItems, productId, categoryId);
  const matchedSaleIds = [
    ...new Set(filteredItems.map((i) => i.sale_id)),
  ];

  let salesByDayComputed: SalesByDay[] = [];
  if (matchedSaleIds.length > 0) {
    const salesRows = await fetchSalesRowsChunked(supabase, matchedSaleIds);
    salesByDayComputed = computeSalesByDay(salesRows);
  }

  const salesSummary = await computeSalesSummaryFiltered(
    supabase,
    matchedSaleIds,
    filteredItems,
  );
  const ticketAverage =
    salesSummary.count > 0
      ? salesSummary.totalAmount / salesSummary.count
      : 0;
  const marginRatePercent =
    salesSummary.totalAmount > 0
      ? (salesSummary.margin / salesSummary.totalAmount) * 100
      : 0;

  const { top, least } = aggregateTopLeastFromItems(
    filteredItems,
    10,
    5,
  );
  const salesByCategory = aggregateCategoriesFromItems(filteredItems, 12);

  const [purchasesSummary, stockValue, lowStockCount, stockReport] =
    await Promise.all([
      getPurchasesSummary(
        supabase,
        companyId,
        storeId,
        fromDate,
        toDate,
      ),
      getStockValue(supabase, companyId, storeId),
      getLowStockCount(supabase, companyId, storeId),
      storeId
        ? fetchStockReportForStore({
            supabase,
            companyId,
            storeId,
            fromDate,
            toDate,
          })
        : Promise.resolve(null),
    ]);

  return {
    salesSummary,
    ticketAverage,
    marginRatePercent,
    salesByDay: salesByDayComputed,
    topProducts: top,
    leastProducts: least,
    salesByCategory,
    purchasesSummary,
    stockValue,
    lowStockCount,
    stockReport,
  };
}

export async function fetchDashboardData(params: {
  companyId: string;
  storeId: string | null;
  period: "today" | "week" | "month";
  selectedDay: string;
}): Promise<DashboardData> {
  const supabase = createClient();
  const range = getDefaultDateRange(params.period);
  const effectiveStoreId = params.storeId;

  const saleIds = await fetchSalesIdsInRange(
    supabase,
    params.companyId,
    effectiveStoreId,
    range.from,
    range.to,
  );

  let salesByDayComputed: SalesByDay[] = [];
  if (saleIds.length > 0) {
    const { data: salesRows, error: salesErr } = await supabase
      .from("sales")
      .select("created_at, total")
      .in("id", saleIds);
    if (salesErr) throw salesErr;
    salesByDayComputed = computeSalesByDay(
      (salesRows ?? []) as Array<{ created_at: string; total: number }>,
    );
  }

  const [
    salesSummary,
    topProducts,
    salesByCategory,
    purchasesSummary,
    stockValue,
    lowStockCount,
  ] = await Promise.all([
    computeSalesSummaryFromIds(supabase, saleIds),
    getTopProducts(supabase, saleIds, 5),
    getSalesByCategory(supabase, saleIds),
    getPurchasesSummary(
      supabase,
      params.companyId,
      effectiveStoreId,
      range.from,
      range.to,
    ),
    getStockValue(supabase, params.companyId, effectiveStoreId),
    getLowStockCount(supabase, params.companyId, effectiveStoreId),
  ]);

  const ticketAverage =
    salesSummary.count > 0
      ? salesSummary.totalAmount / salesSummary.count
      : 0;

  const daySaleIds = await fetchSalesIdsInRange(
    supabase,
    params.companyId,
    effectiveStoreId,
    params.selectedDay,
    params.selectedDay,
  );
  const [daySalesSummary, dayPurchasesSummary] = await Promise.all([
    computeSalesSummaryFromIds(supabase, daySaleIds),
    getPurchasesSummary(
      supabase,
      params.companyId,
      effectiveStoreId,
      params.selectedDay,
      params.selectedDay,
    ),
  ]);

  return {
    salesSummary,
    ticketAverage,
    salesByDay: salesByDayComputed,
    topProducts,
    salesByCategory,
    purchasesSummary,
    stockValue,
    lowStockCount,
    daySalesSummary,
    dayPurchasesSummary,
  };
}

function getPreviousMonthRange(): { from: string; to: string } {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  return { from: format(prev, "yyyy-MM-dd"), to: format(to, "yyyy-MM-dd") };
}

function formatPeriodFr(from: string, to: string): string {
  const a = new Date(`${from}T12:00:00`);
  const b = new Date(`${to}T12:00:00`);
  const o = { day: "2-digit" as const, month: "short" as const, year: "numeric" as const };
  return `${a.toLocaleDateString("fr-FR", o)} → ${b.toLocaleDateString("fr-FR", o)}`;
}

/** Contexte agrégé pour l’IA — aligné `fetchPredictionContext` (Flutter / `predictions_repository.dart`). */
export async function fetchPredictionContext(params: {
  companyId: string;
  companyName: string;
  storeId: string | null;
  storeName: string | null;
}): Promise<PredictionContext> {
  const supabase = createClient();
  const range = getDefaultDateRange("month");
  const prevRange = getPreviousMonthRange();
  const { companyId, storeId, companyName, storeName } = params;

  const saleIds = await fetchSalesIdsInRange(
    supabase,
    companyId,
    storeId,
    range.from,
    range.to,
  );
  const prevSaleIds = await fetchSalesIdsInRange(
    supabase,
    companyId,
    storeId,
    prevRange.from,
    prevRange.to,
  );

  let salesByDayComputed: SalesByDay[] = [];
  if (saleIds.length > 0) {
    const { data: salesRows, error: salesErr } = await supabase
      .from("sales")
      .select("created_at, total")
      .in("id", saleIds);
    if (salesErr) throw salesErr;
    salesByDayComputed = computeSalesByDay(
      (salesRows ?? []) as Array<{ created_at: string; total: number }>,
    );
  }

  const [
    salesSummary,
    topProducts,
    prevSalesSummary,
    purchasesSummary,
    stockResult,
    lowStockCount,
  ] = await Promise.all([
    computeSalesSummaryFromIds(supabase, saleIds),
    getTopProducts(supabase, saleIds, 15),
    computeSalesSummaryFromIds(supabase, prevSaleIds),
    getPurchasesSummary(supabase, companyId, storeId, range.from, range.to),
    getStockValue(supabase, companyId, storeId),
    getLowStockCount(supabase, companyId, storeId),
  ]);

  const marginRatePercent =
    salesSummary.totalAmount > 0
      ? (salesSummary.margin / salesSummary.totalAmount) * 100
      : 0;

  const salesSummaryPred: SalesSummaryForPrediction = {
    totalAmount: salesSummary.totalAmount,
    count: salesSummary.count,
    itemsSold: salesSummary.itemsSold,
    margin: salesSummary.margin,
  };

  const previousMonthSummary =
    prevSalesSummary.totalAmount > 0 || prevSalesSummary.count > 0
      ? {
          totalAmount: prevSalesSummary.totalAmount,
          count: prevSalesSummary.count,
          margin: prevSalesSummary.margin,
        }
      : null;

  const topPred: TopProductPrediction[] = topProducts.map((p) => ({
    productName: p.productName,
    quantitySold: p.quantitySold,
    revenue: p.revenue,
    margin: p.margin,
  }));

  const purchasesPred: PurchasesSummaryForPrediction = {
    totalAmount: purchasesSummary.totalAmount,
    count: purchasesSummary.count,
  };

  const salesByDayPred: SalesByDayPrediction[] = salesByDayComputed.map((d) => ({
    date: d.date,
    total: d.total,
    count: d.count,
  }));

  return {
    companyName,
    storeName,
    period: formatPeriodFr(range.from, range.to),
    salesSummary: salesSummaryPred,
    previousMonthSummary,
    salesByDay: salesByDayPred,
    topProducts: topPred,
    purchasesSummary: purchasesPred,
    stockValue: stockResult.totalValue,
    lowStockCount,
    marginRatePercent,
  };
}
