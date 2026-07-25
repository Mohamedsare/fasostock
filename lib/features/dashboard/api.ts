"use client";

import { createClient } from "@/lib/supabase/client";
import {
  getPreviousComparableRange,
  resolveDashboardRange,
  type DashboardPeriod,
} from "@/lib/features/dashboard/date-range";
import {
  localDateFromIso,
  localDayEndIso,
  localDayStartIso,
} from "@/lib/utils/local-day";
import type {
  CategorySales,
  DashboardData,
  ExpensesSummary,
  PurchasesSummary,
  ReportsPageData,
  SalesByDay,
  SalesSummary,
  StockMovementByDay,
  StockReportData,
  StockValue,
  StockWatchSample,
  TopProduct,
} from "@/lib/features/dashboard/types";
import { countLowStockAlerts } from "@/lib/features/inventory/stock-alert-count";
import {
  effectiveStockAlertThreshold,
  isLowStockAlert,
} from "@/lib/features/inventory/stock-alert-rules";
import { fetchPredictionContextWithSupabase } from "@/lib/features/dashboard/prediction-context-data";
import type { PredictionContext } from "@/lib/features/ai/prediction-types";

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
    .gte("created_at", localDayStartIso(fromDate))
    .lte("created_at", localDayEndIso(toDate));
  if (storeId) q = q.eq("store_id", storeId);
  if (createdBy) q = q.eq("created_by", createdBy);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => r.id as string);
}

async function computeSalesSummaryFromIds(
  supabase: ReturnType<typeof createClient>,
  saleIds: string[],
  ratioById: Map<string, number>,
): Promise<SalesSummary> {
  if (saleIds.length === 0) return emptySummary();
  const { data: sales, error: sErr } = await supabase
    .from("sales")
    .select("id, total")
    .in("id", saleIds);
  if (sErr) throw sErr;
  let totalAmount = 0;
  for (const s of sales ?? []) {
    const row = s as { id?: string; total?: number };
    totalAmount += Number(row.total ?? 0) * ratioFor(ratioById, row.id);
  }
  const { data: items, error: iErr } = await supabase
    .from("sale_items")
    .select(
      "sale_id, quantity, total, product:products(id, purchase_price)",
    )
    .in("sale_id", saleIds);
  if (iErr) throw iErr;
  let itemsSold = 0;
  let margin = 0;
  for (const row of items ?? []) {
    const m = row as {
      sale_id?: string;
      quantity?: number;
      total?: number;
      product?: { purchase_price?: number } | null;
    };
    const qty = Number(m.quantity ?? 0);
    const lineTotal = Number(m.total ?? 0);
    const purchasePrice = Number(m.product?.purchase_price ?? 0);
    itemsSold += qty;
    margin += (lineTotal - purchasePrice * qty) * ratioFor(ratioById, m.sale_id);
  }
  return {
    totalAmount,
    count: saleIds.length,
    itemsSold,
    margin,
  };
}

function computeSalesByDay(
  sales: Array<{ id?: string; created_at: string; total: number }>,
  ratioById: Map<string, number>,
): SalesByDay[] {
  const byDay = new Map<string, { total: number; count: number }>();
  for (const s of sales) {
    const date = s.created_at ? localDateFromIso(s.created_at) : "";
    if (!date) continue;
    const cur = byDay.get(date) ?? { total: 0, count: 0 };
    byDay.set(date, {
      total: cur.total + Number(s.total ?? 0) * ratioFor(ratioById, s.id),
      count: cur.count + 1,
    });
  }
  return [...byDay.entries()]
    .map(([date, v]) => ({ date, total: v.total, count: v.count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Fusionne la courbe (nombre de ventes par jour = base vente) avec la recette CAISSE par jour
 * (`total` = encaissé du jour). Ajoute les jours qui n'ont que des remboursements (count 0).
 */
function mergeSalesByDayWithCash(
  saleBased: SalesByDay[],
  cashByDay: Map<string, { revenue: number; margin: number }>,
): SalesByDay[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const d of saleBased) map.set(d.date, { total: 0, count: d.count });
  for (const [date, v] of cashByDay) {
    const cur = map.get(date) ?? { total: 0, count: 0 };
    cur.total = v.revenue;
    map.set(date, cur);
  }
  return [...map.entries()]
    .map(([date, v]) => ({ date, total: v.total, count: v.count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function aggregateProductsFromSales(
  supabase: ReturnType<typeof createClient>,
  saleIds: string[],
  ratioById: Map<string, number>,
): Promise<TopProduct[]> {
  if (saleIds.length === 0) return [];
  const { data: items, error } = await supabase
    .from("sale_items")
    .select(
      "sale_id, product_id, quantity, total, product:products(id, name, purchase_price)",
    )
    .in("sale_id", saleIds);
  if (error) throw error;
  const agg = new Map<
    string,
    { name: string; qty: number; revenue: number; cost: number }
  >();
  for (const row of items ?? []) {
    const m = row as {
      sale_id?: string;
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
    const r = ratioFor(ratioById, m.sale_id);
    const cur = agg.get(pid) ?? { name, qty: 0, revenue: 0, cost: 0 };
    agg.set(pid, {
      name,
      qty: cur.qty + qty,
      revenue: cur.revenue + total * r,
      cost: cur.cost + purchasePrice * qty * r,
    });
  }
  return [...agg.entries()].map(([productId, v]) => ({
    productId,
    productName: v.name,
    quantitySold: v.qty,
    revenue: v.revenue,
    margin: v.revenue - v.cost,
  }));
}

async function getSalesByCategory(
  supabase: ReturnType<typeof createClient>,
  saleIds: string[],
  ratioById: Map<string, number>,
): Promise<CategorySales[]> {
  if (saleIds.length === 0) return [];
  const { data: items, error } = await supabase
    .from("sale_items")
    .select(
      "sale_id, quantity, total, product:products(id, name, category_id, category:categories(id, name))",
    )
    .in("sale_id", saleIds);
  if (error) throw error;
  const agg = new Map<string, { name: string; revenue: number; qty: number }>();
  for (const row of items ?? []) {
    const m = row as {
      sale_id?: string;
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
      revenue: cur.revenue + Number(m.total ?? 0) * ratioFor(ratioById, m.sale_id),
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
    .gte("created_at", localDayStartIso(fromDate))
    .lte("created_at", localDayEndIso(toDate));
  if (storeId) q = q.eq("store_id", storeId);
  const { data, error } = await q;
  if (error) throw error;
  let totalAmount = 0;
  for (const p of data ?? []) {
    totalAmount += Number((p as { total?: number }).total ?? 0);
  }
  return { totalAmount, count: (data ?? []).length };
}

/**
 * Total des dépenses (charges page Dépenses) sur une plage de dates (incluse).
 * En vue boutique, ne compte que les dépenses rattachées à cette boutique
 * (aligné filtre page Dépenses) ; en vue entreprise, toutes les boutiques.
 */
async function getExpensesSummary(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  storeId: string | null,
  fromDate: string,
  toDate: string,
): Promise<ExpensesSummary> {
  let q = supabase
    .from("expenses")
    .select("id, amount")
    .eq("company_id", companyId)
    .gte("expense_date", fromDate)
    .lte("expense_date", toDate);
  if (storeId) q = q.eq("store_id", storeId);
  const { data, error } = await q;
  if (error) throw error;
  let totalAmount = 0;
  for (const e of data ?? []) {
    totalAmount += Math.max(0, Number((e as { amount?: number }).amount ?? 0));
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

/** Aligné page Inventaire (`fetchInventoryScreenData.stats.lowStockCount`). */
async function fetchDashboardLowStock(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  storeId: string | null,
  sampleLimit = 12,
): Promise<{ lowStockCount: number; stockWatchSamples: StockWatchSample[] }> {
  const { count, lines } = await countLowStockAlerts(supabase, companyId, storeId);
  return {
    lowStockCount: count,
    stockWatchSamples: lines.slice(0, sampleLimit).map((l) => ({
      productName: l.productName,
      quantity: l.quantity,
      threshold: l.threshold,
      storeName: l.storeName,
    })),
  };
}

const CHUNK = 800;

/**
 * Part réellement encaissée de chaque vente (0..1) — pour reconnaître le CA et la
 * marge « au prorata de l'encaissé » : une vente à crédit non remboursée ne compte
 * pas encore comme bénéfice. Encaissé = Σ paiements réels (`method ≠ 'other'`, le
 * solde à crédit POS étant justement enregistré en `'other'`). Les remboursements
 * ultérieurs sont de vrais paiements et font monter le ratio. Une vente sans aucune
 * ligne de paiement (héritage) est considérée soldée (ratio 1) pour ne rien casser.
 */
async function fetchSaleRecognitionRatios(
  supabase: ReturnType<typeof createClient>,
  saleIds: string[],
): Promise<Map<string, number>> {
  const ratioById = new Map<string, number>();
  if (saleIds.length === 0) return ratioById;

  const totalById = new Map<string, number>();
  for (let i = 0; i < saleIds.length; i += CHUNK) {
    const chunk = saleIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("sales")
      .select("id, total")
      .in("id", chunk);
    if (error) throw error;
    for (const row of (data ?? []) as Array<{ id?: string; total?: number }>) {
      if (row.id) totalById.set(row.id, Number(row.total ?? 0));
    }
  }

  const paidById = new Map<string, number>();
  const hasPaymentRow = new Set<string>();
  for (let i = 0; i < saleIds.length; i += CHUNK) {
    const chunk = saleIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("sale_payments")
      .select("sale_id, method, amount")
      .in("sale_id", chunk);
    if (error) throw error;
    for (const row of (data ?? []) as Array<{
      sale_id?: string;
      method?: string;
      amount?: number;
    }>) {
      const sid = row.sale_id;
      if (!sid) continue;
      hasPaymentRow.add(sid);
      if (row.method !== "other") {
        paidById.set(sid, (paidById.get(sid) ?? 0) + Number(row.amount ?? 0));
      }
    }
  }

  for (const id of saleIds) {
    const total = totalById.get(id) ?? 0;
    if (!hasPaymentRow.has(id) || total <= 0) {
      ratioById.set(id, 1);
      continue;
    }
    const paid = paidById.get(id) ?? 0;
    ratioById.set(id, Math.max(0, Math.min(1, paid / total)));
  }
  return ratioById;
}

/**
 * Reconnaissance CAISSE : recette (et marge) attribuées au JOUR DE L'ENCAISSEMENT.
 * Somme des paiements réels (`method ≠ 'other'`) dont la date tombe dans [fromDate, toDate],
 * quelle que soit la date de la vente d'origine → un vieux crédit remboursé aujourd'hui
 * compte comme recette d'aujourd'hui. La marge est reconnue au prorata de la marge de la vente.
 * Ventes annulées/remboursées exclues (status = 'completed').
 */
async function fetchCashRecognizedInRange(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  storeId: string | null,
  fromDate: string,
  toDate: string,
  createdBy?: string | null,
): Promise<{
  revenue: number;
  margin: number;
  /** Part de la recette provenant du remboursement de crédits d'anciennes ventes (créées AVANT la période). */
  creditRepayments: number;
  byDay: Map<string, { revenue: number; margin: number }>;
}> {
  const byDay = new Map<string, { revenue: number; margin: number }>();

  // 1) Paiements réels encaissés sur la période (RLS = entreprise courante).
  const { data: payRows, error: pErr } = await supabase
    .from("sale_payments")
    .select("sale_id, amount, method, created_at")
    .neq("method", "other")
    .gte("created_at", localDayStartIso(fromDate))
    .lte("created_at", localDayEndIso(toDate));
  if (pErr) throw pErr;
  const payments = ((payRows ?? []) as Array<{
    sale_id?: string;
    amount?: number;
    created_at?: string;
  }>)
    .filter((r) => r.sale_id)
    .map((r) => ({
      saleId: String(r.sale_id),
      amount: Number(r.amount ?? 0),
      createdAt: String(r.created_at ?? ""),
    }));
  if (payments.length === 0) return { revenue: 0, margin: 0, creditRepayments: 0, byDay };

  const saleIds = [...new Set(payments.map((p) => p.saleId))];

  // 2) Ventes éligibles (entreprise / boutique / caissier / complétées) + total + date de vente.
  const totalById = new Map<string, number>();
  const saleDayById = new Map<string, string>();
  const eligible = new Set<string>();
  for (let i = 0; i < saleIds.length; i += CHUNK) {
    const chunk = saleIds.slice(i, i + CHUNK);
    let q = supabase
      .from("sales")
      .select("id, total, store_id, status, company_id, created_by, created_at")
      .in("id", chunk)
      .eq("company_id", companyId)
      .eq("status", "completed");
    if (storeId) q = q.eq("store_id", storeId);
    if (createdBy) q = q.eq("created_by", createdBy);
    const { data, error } = await q;
    if (error) throw error;
    for (const row of (data ?? []) as Array<{ id?: string; total?: number; created_at?: string }>) {
      if (!row.id) continue;
      eligible.add(row.id);
      totalById.set(row.id, Number(row.total ?? 0));
      saleDayById.set(row.id, row.created_at ? localDateFromIso(row.created_at) : "");
    }
  }
  if (eligible.size === 0) return { revenue: 0, margin: 0, creditRepayments: 0, byDay };

  // 3) Coût des ventes éligibles → ratio de marge par vente.
  const costById = new Map<string, number>();
  const eligibleIds = [...eligible];
  for (let i = 0; i < eligibleIds.length; i += CHUNK) {
    const chunk = eligibleIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("sale_items")
      .select("sale_id, quantity, product:products(purchase_price)")
      .in("sale_id", chunk);
    if (error) throw error;
    for (const row of (data ?? []) as Array<{
      sale_id?: string;
      quantity?: number;
      product?: { purchase_price?: number } | null;
    }>) {
      if (!row.sale_id) continue;
      const qty = Number(row.quantity ?? 0);
      const pp = Number(row.product?.purchase_price ?? 0);
      costById.set(row.sale_id, (costById.get(row.sale_id) ?? 0) + pp * qty);
    }
  }

  // 4) Agrégation : recette = Σ paiements ; marge = Σ paiement × ratio de marge de la vente.
  //    creditRepayments = paiements sur des ventes créées AVANT la période (remboursement de vieux crédits).
  let revenue = 0;
  let margin = 0;
  let creditRepayments = 0;
  for (const p of payments) {
    if (!eligible.has(p.saleId)) continue;
    const total = totalById.get(p.saleId) ?? 0;
    const cost = costById.get(p.saleId) ?? 0;
    const marginRatio = total > 0 ? Math.max(0, Math.min(1, (total - cost) / total)) : 0;
    const rev = p.amount;
    const mar = p.amount * marginRatio;
    revenue += rev;
    margin += mar;
    const saleDay = saleDayById.get(p.saleId) ?? "";
    if (saleDay && saleDay < fromDate) creditRepayments += rev;
    const day = p.createdAt ? localDateFromIso(p.createdAt) : "";
    if (day) {
      const cur = byDay.get(day) ?? { revenue: 0, margin: 0 };
      cur.revenue += rev;
      cur.margin += mar;
      byDay.set(day, cur);
    }
  }
  return { revenue, margin, creditRepayments, byDay };
}

/** Ratio de reconnaissance d'une vente (défaut 1 si inconnu). */
function ratioFor(
  ratioById: Map<string, number>,
  saleId: string | undefined | null,
): number {
  if (!saleId) return 1;
  const r = ratioById.get(saleId);
  return r == null ? 1 : r;
}

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
): Promise<Array<{ id: string; created_at: string; total: number }>> {
  if (saleIds.length === 0) return [];
  const out: Array<{ id: string; created_at: string; total: number }> = [];
  for (let i = 0; i < saleIds.length; i += CHUNK) {
    const chunk = saleIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("sales")
      .select("id, created_at, total")
      .in("id", chunk);
    if (error) throw error;
    out.push(
      ...((data ?? []) as Array<{ id: string; created_at: string; total: number }>),
    );
  }
  return out;
}

async function computeSalesSummaryFiltered(
  supabase: ReturnType<typeof createClient>,
  matchedSaleIds: string[],
  filteredItems: SaleItemRow[],
  ratioById: Map<string, number>,
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
    totalAmount += Number(s.total ?? 0) * ratioFor(ratioById, s.id);
  }
  let itemsSold = 0;
  let margin = 0;
  for (const row of filteredItems) {
    const qty = Number(row.quantity ?? 0);
    const lineTotal = Number(row.total ?? 0);
    const purchasePrice = Number(row.product?.purchase_price ?? 0);
    itemsSold += qty;
    margin += (lineTotal - purchasePrice * qty) * ratioFor(ratioById, row.sale_id);
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
  ratioById: Map<string, number>,
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
      revenue: cur.revenue + Number(row.total ?? 0) * ratioFor(ratioById, row.sale_id),
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
  ratioById: Map<string, number>,
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
    const r = ratioFor(ratioById, row.sale_id);
    const cur = agg.get(pid) ?? { name, qty: 0, revenue: 0, cost: 0 };
    agg.set(pid, {
      name,
      qty: cur.qty + qty,
      revenue: cur.revenue + total * r,
      cost: cur.cost + purchasePrice * qty * r,
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
    const stockMin = Number(p?.stock_min ?? 0);
    const threshold = effectiveStockAlertThreshold(
      stockMin,
      overrideMap.get(pid) ?? null,
      defaultThreshold,
    );
    if (qty <= 0) {
      outOfStock.push({
        productId: pid,
        productName: name,
        quantity: qty,
        threshold,
      });
    } else if (isLowStockAlert(qty, threshold)) {
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
    .gte("created_at", localDayStartIso(fromDate))
    .lte("created_at", localDayEndIso(toDate));
  if (movErr) throw movErr;

  let entries = 0;
  let exits = 0;
  const byDayNet = new Map<string, number>();
  for (const mv of movements ?? []) {
    const mm = mv as { quantity?: number; created_at?: string };
    const q = Number(mm.quantity ?? 0);
    const raw = String(mm.created_at ?? "");
    const day = raw ? localDateFromIso(raw) : raw;
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

  // CA et marge reconnus au prorata de l'encaissé (une vente à crédit non
  // remboursée ne compte pas encore comme bénéfice).
  const ratioById = await fetchSaleRecognitionRatios(supabase, matchedSaleIds);

  let salesByDayComputed: SalesByDay[] = [];
  if (matchedSaleIds.length > 0) {
    const salesRows = await fetchSalesRowsChunked(supabase, matchedSaleIds);
    salesByDayComputed = computeSalesByDay(salesRows, ratioById);
  }

  const salesSummaryBase = await computeSalesSummaryFiltered(
    supabase,
    matchedSaleIds,
    filteredItems,
    ratioById,
  );
  // Logique CAISSE : recette/marge = argent réellement encaissé sur la période
  // (crédits remboursés inclus, au jour du paiement). Uniquement SANS filtre produit/
  // catégorie — un encaissement n'est pas rattachable à un produit précis.
  let salesSummary = salesSummaryBase;
  if (!productId && !categoryId) {
    const cash = await fetchCashRecognizedInRange(
      supabase,
      companyId,
      storeId,
      fromDate,
      toDate,
      cashierUserId,
    );
    salesSummary = { ...salesSummaryBase, totalAmount: cash.revenue, margin: cash.margin };
    salesByDayComputed = mergeSalesByDayWithCash(salesByDayComputed, cash.byDay);
  }
  const ticketAverage =
    salesSummary.count > 0 ? salesSummary.totalAmount / salesSummary.count : 0;
  const marginRatePercent =
    salesSummary.totalAmount > 0
      ? (salesSummary.margin / salesSummary.totalAmount) * 100
      : 0;

  const { top, least } = aggregateTopLeastFromItems(
    filteredItems,
    10,
    5,
    ratioById,
  );
  const salesByCategory = aggregateCategoriesFromItems(filteredItems, 12, ratioById);

  const [purchasesSummary, stockValue, lowStock, stockReport] = await Promise.all([
      getPurchasesSummary(
        supabase,
        companyId,
        storeId,
        fromDate,
        toDate,
      ),
      getStockValue(supabase, companyId, storeId),
      fetchDashboardLowStock(supabase, companyId, storeId),
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

  const { lowStockCount } = lowStock;

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
  period: DashboardPeriod;
  selectedDay: string;
  customFrom?: string | null;
  customTo?: string | null;
}): Promise<DashboardData> {
  const supabase = createClient();
  const range = resolveDashboardRange({
    period: params.period,
    customFrom: params.customFrom,
    customTo: params.customTo,
  });
  const prevRange = getPreviousComparableRange(range);
  const effectiveStoreId = params.storeId;

  const [saleIds, prevSaleIds] = await Promise.all([
    fetchSalesIdsInRange(
      supabase,
      params.companyId,
      effectiveStoreId,
      range.from,
      range.to,
    ),
    fetchSalesIdsInRange(
      supabase,
      params.companyId,
      effectiveStoreId,
      prevRange.from,
      prevRange.to,
    ),
  ]);

  // CA et marge reconnus au prorata de l'encaissé (une vente à crédit non
  // remboursée ne compte pas encore comme bénéfice).
  const [ratioById, prevRatioById] = await Promise.all([
    fetchSaleRecognitionRatios(supabase, saleIds),
    fetchSaleRecognitionRatios(supabase, prevSaleIds),
  ]);

  let salesByDayComputed: SalesByDay[] = [];
  if (saleIds.length > 0) {
    const { data: salesRows, error: salesErr } = await supabase
      .from("sales")
      .select("id, created_at, total")
      .in("id", saleIds);
    if (salesErr) throw salesErr;
    salesByDayComputed = computeSalesByDay(
      (salesRows ?? []) as Array<{ id: string; created_at: string; total: number }>,
      ratioById,
    );
  }

  const productAggP = aggregateProductsFromSales(supabase, saleIds, ratioById);

  const [
    salesSummary,
    productAgg,
    previousPeriodSummary,
    salesByCategory,
    purchasesSummary,
    previousPurchasesSummary,
    expensesSummary,
    previousExpensesSummary,
    stockValue,
    lowStock,
  ] = await Promise.all([
    computeSalesSummaryFromIds(supabase, saleIds, ratioById),
    productAggP,
    computeSalesSummaryFromIds(supabase, prevSaleIds, prevRatioById),
    getSalesByCategory(supabase, saleIds, ratioById),
    getPurchasesSummary(
      supabase,
      params.companyId,
      effectiveStoreId,
      range.from,
      range.to,
    ),
    getPurchasesSummary(
      supabase,
      params.companyId,
      effectiveStoreId,
      prevRange.from,
      prevRange.to,
    ),
    getExpensesSummary(
      supabase,
      params.companyId,
      effectiveStoreId,
      range.from,
      range.to,
    ),
    getExpensesSummary(
      supabase,
      params.companyId,
      effectiveStoreId,
      prevRange.from,
      prevRange.to,
    ),
    getStockValue(supabase, params.companyId, effectiveStoreId),
    fetchDashboardLowStock(supabase, params.companyId, effectiveStoreId),
  ]);

  const { lowStockCount, stockWatchSamples } = lowStock;

  const byRev = [...productAgg].sort((a, b) => b.revenue - a.revenue);
  const topProducts = byRev.slice(0, 5);
  const topByMargin = [...productAgg]
    .sort((a, b) => b.margin - a.margin)
    .slice(0, 3);
  const leastByRevenue = [...productAgg]
    .filter((p) => p.revenue > 0)
    .sort((a, b) => a.revenue - b.revenue)
    .slice(0, 3);

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
  const dayRatioById = await fetchSaleRecognitionRatios(supabase, daySaleIds);
  const [daySalesSummary, dayPurchasesSummary, dayExpenses] = await Promise.all([
    computeSalesSummaryFromIds(supabase, daySaleIds, dayRatioById),
    getPurchasesSummary(
      supabase,
      params.companyId,
      effectiveStoreId,
      params.selectedDay,
      params.selectedDay,
    ),
    getExpensesSummary(
      supabase,
      params.companyId,
      effectiveStoreId,
      params.selectedDay,
      params.selectedDay,
    ),
  ]);

  // Logique CAISSE : recette/marge attribuées au JOUR DE L'ENCAISSEMENT
  // (un vieux crédit remboursé aujourd'hui compte dans l'encaissé d'aujourd'hui).
  const [cashRange, cashPrev, cashDay] = await Promise.all([
    fetchCashRecognizedInRange(supabase, params.companyId, effectiveStoreId, range.from, range.to),
    fetchCashRecognizedInRange(supabase, params.companyId, effectiveStoreId, prevRange.from, prevRange.to),
    fetchCashRecognizedInRange(supabase, params.companyId, effectiveStoreId, params.selectedDay, params.selectedDay),
  ]);
  const salesSummaryCash = { ...salesSummary, totalAmount: cashRange.revenue, margin: cashRange.margin };
  const previousPeriodSummaryCash = {
    ...previousPeriodSummary,
    totalAmount: cashPrev.revenue,
    margin: cashPrev.margin,
  };
  const daySalesSummaryCash = { ...daySalesSummary, totalAmount: cashDay.revenue, margin: cashDay.margin };
  const ticketAverageCash =
    salesSummary.count > 0 ? cashRange.revenue / salesSummary.count : 0;
  const salesByDayCash = mergeSalesByDayWithCash(salesByDayComputed, cashRange.byDay);

  return {
    salesSummary: salesSummaryCash,
    ticketAverage: ticketAverageCash,
    salesByDay: salesByDayCash,
    topProducts,
    topByMargin,
    leastByRevenue,
    salesByCategory,
    purchasesSummary,
    expensesSummary,
    stockValue,
    lowStockCount,
    stockWatchSamples,
    previousPeriodSummary: previousPeriodSummaryCash,
    previousPurchasesSummary,
    previousExpensesSummary,
    daySalesSummary: daySalesSummaryCash,
    dayPurchasesSummary,
    dayExpenses,
    dayCreditRepayments: cashDay.creditRepayments,
    periodCreditRepayments: cashRange.creditRepayments,
  };
}

/** Contexte agrégé pour l’IA — aligné `fetchPredictionContext` (Flutter / `predictions_repository.dart`). */
export async function fetchPredictionContext(params: {
  companyId: string;
  companyName: string;
  storeId: string | null;
  storeName: string | null;
}): Promise<PredictionContext> {
  return fetchPredictionContextWithSupabase(createClient(), params);
}
