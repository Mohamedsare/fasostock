"use client";

import { createClient } from "@/lib/supabase/client";
import { fetchAllPages } from "@/lib/supabase/fetch-all-pages";
import { fetchByChunks } from "@/lib/supabase/fetch-by-chunks";
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
  CashierPerformance,
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
  TeamPerformanceData,
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

/**
 * Identifiants des ventes complétées de la plage — socle de tous les agrégats du
 * tableau de bord et des rapports.
 *
 * Paginé : sans cela, PostgREST s'arrêtait à 1000 ventes **sans le dire**. Toutes les
 * mesures bâties dessus (CA, marge, panier moyen, top produits) étaient alors amputées
 * de la même manière — un écran parfaitement crédible avec des chiffres faux, ce qui est
 * plus grave qu'une page en erreur.
 */
async function fetchSalesIdsInRange(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  storeId: string | null,
  fromDate: string,
  toDate: string,
  createdBy?: string | null,
): Promise<string[]> {
  const { data, error } = await fetchAllPages((from, to) => {
    let q = supabase
      .from("sales")
      .select("id")
      .eq("company_id", companyId)
      .eq("status", "completed")
      .gte("created_at", localDayStartIso(fromDate))
      .lte("created_at", localDayEndIso(toDate))
      .order("id", { ascending: true });
    if (storeId) q = q.eq("store_id", storeId);
    if (createdBy) q = q.eq("created_by", createdBy);
    return q.range(from, to);
  });
  if (error) throw error;
  return (data ?? []).map((r) => r.id as string);
}

async function computeSalesSummaryFromIds(
  supabase: ReturnType<typeof createClient>,
  saleIds: string[],
  ratioById: Map<string, number>,
): Promise<SalesSummary> {
  if (saleIds.length === 0) return emptySummary();

  // `fetchByChunks` et non `.in(…, saleIds)` : la liste complète faisait exploser la
  // longueur de l'URL (~29 ko à 800 ventes) et le tableau de bord tombait en erreur
  // chez les entreprises qui marchent bien. Voir `lib/supabase/fetch-by-chunks.ts`.
  const sales = await fetchByChunks(saleIds, async (chunk, from, to) => {
    const { data, error } = await supabase
      .from("sales")
      .select("id, total")
      .in("id", chunk)
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw error;
    return (data ?? []) as Array<{ id?: string; total?: number }>;
  });
  let totalAmount = 0;
  for (const row of sales) {
    totalAmount += Number(row.total ?? 0) * ratioFor(ratioById, row.id);
  }

  const items = await fetchByChunks(saleIds, async (chunk, from, to) => {
    const { data, error } = await supabase
      .from("sale_items")
      .select("sale_id, quantity, total, product:products(id, purchase_price)")
      .in("sale_id", chunk)
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw error;
    return (data ?? []) as Array<{
      sale_id?: string;
      quantity?: number;
      total?: number;
      product?: { purchase_price?: number } | null;
    }>;
  });
  let itemsSold = 0;
  let margin = 0;
  for (const m of items) {
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
  const items = await fetchByChunks(saleIds, async (chunk, from, to) => {
    const { data, error } = await supabase
      .from("sale_items")
      .select(
        "sale_id, product_id, quantity, total, product:products(id, name, purchase_price)",
      )
      .in("sale_id", chunk)
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw error;
    return (data ?? []) as Array<{
      sale_id?: string;
      product_id?: string;
      quantity?: number;
      total?: number;
      product?: { id?: string; name?: string; purchase_price?: number } | null;
    }>;
  });
  const agg = new Map<
    string,
    { name: string; qty: number; revenue: number; cost: number }
  >();
  for (const m of items) {
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
  const items = await fetchByChunks(saleIds, async (chunk, from, to) => {
    const { data, error } = await supabase
      .from("sale_items")
      .select(
        "sale_id, quantity, total, product:products(id, name, category_id, category:categories(id, name))",
      )
      .in("sale_id", chunk)
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw error;
    return (data ?? []) as Array<{
      sale_id?: string;
      quantity?: number;
      total?: number;
      product?: {
        category_id?: string | null;
        category?: { id?: string; name?: string } | null;
      } | null;
    }>;
  });
  const agg = new Map<string, { name: string; revenue: number; qty: number }>();
  for (const m of items) {
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
  const { data, error } = await fetchAllPages((from, to) => {
    let q = supabase
      .from("purchases")
      .select("id, total")
      .eq("company_id", companyId)
      .in("status", ["confirmed", "received", "partially_received"])
      .gte("created_at", localDayStartIso(fromDate))
      .lte("created_at", localDayEndIso(toDate))
      .order("id", { ascending: true });
    if (storeId) q = q.eq("store_id", storeId);
    return q.range(from, to);
  });
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
  const { data, error } = await fetchAllPages((from, to) => {
    let q = supabase
      .from("expenses")
      .select("id, amount")
      .eq("company_id", companyId)
      .gte("expense_date", fromDate)
      .lte("expense_date", toDate)
      .order("id", { ascending: true });
    if (storeId) q = q.eq("store_id", storeId);
    return q.range(from, to);
  });
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
    // Paginé : la valeur du stock se calcule sur TOUTES les lignes d'inventaire.
    // Tronquée, elle sous-évaluait le patrimoine affiché au propriétaire.
    const { data: inv, error } = await fetchAllPages((from, to) =>
      supabase
        .from("store_inventory")
        .select("product_id, quantity, product:products(id, sale_price)")
        .eq("store_id", storeId)
        .order("product_id", { ascending: true })
        .range(from, to),
    );
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
  // Vue entreprise : autant de lignes que (boutiques × catalogue). C'est la lecture la
  // plus volumineuse du tableau de bord — elle dépassait 1000 lignes dès deux boutiques
  // au catalogue fourni. Chunké par boutique ET paginé.
  const inv = await fetchByChunks(storeIds, async (chunk, from, to) => {
    const { data, error } = await supabase
      .from("store_inventory")
      .select("store_id, product_id, quantity, product:products(id, sale_price)")
      .in("store_id", chunk)
      .order("store_id", { ascending: true })
      .order("product_id", { ascending: true })
      .range(from, to);
    if (error) throw error;
    return (data ?? []) as Array<Record<string, unknown>>;
  });
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
  sampleLimit = 20,
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
  const totalRows = await fetchByChunks(saleIds, async (chunk, from, to) => {
    const { data, error } = await supabase
      .from("sales")
      .select("id, total")
      .in("id", chunk)
      .order("id")
      .range(from, to);
    if (error) throw error;
    return (data ?? []) as Array<{ id?: string; total?: number }>;
  });
  for (const row of totalRows) {
    if (row.id) totalById.set(row.id, Number(row.total ?? 0));
  }

  const paidById = new Map<string, number>();
  const hasPaymentRow = new Set<string>();
  const paymentRows = await fetchByChunks(saleIds, async (chunk, from, to) => {
    const { data, error } = await supabase
      .from("sale_payments")
      .select("sale_id, method, amount")
      .in("sale_id", chunk)
      .order("id")
      .range(from, to);
    if (error) throw error;
    return (data ?? []) as Array<{
      sale_id?: string;
      method?: string;
      amount?: number;
    }>;
  });
  for (const row of paymentRows) {
    const sid = row.sale_id;
    if (!sid) continue;
    hasPaymentRow.add(sid);
    if (row.method !== "other") {
      paidById.set(sid, (paidById.get(sid) ?? 0) + Number(row.amount ?? 0));
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
  // Paginé : c'est la recette caisse du tableau de bord. Une boutique encaisse plus de
  // 1000 paiements par mois sans rien avoir d'inhabituel — tronquée, la recette affichée
  // était tout simplement inférieure à la réalité.
  const { data: payRows, error: pErr } = await fetchAllPages((from, to) =>
    supabase
      .from("sale_payments")
      .select("sale_id, amount, method, created_at")
      .neq("method", "other")
      .gte("created_at", localDayStartIso(fromDate))
      .lte("created_at", localDayEndIso(toDate))
      .order("id", { ascending: true })
      .range(from, to),
  );
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

  // 2) Ventes éligibles (entreprise / boutique / caissier / complétées) + total + instant de vente.
  const totalById = new Map<string, number>();
  const saleCreatedMsById = new Map<string, number>();
  const eligible = new Set<string>();
  const eligibleRows = await fetchByChunks(saleIds, async (chunk, from, to) => {
    let q = supabase
      .from("sales")
      .select("id, total, store_id, status, company_id, created_by, created_at")
      .in("id", chunk)
      .eq("company_id", companyId)
      .eq("status", "completed");
    if (storeId) q = q.eq("store_id", storeId);
    if (createdBy) q = q.eq("created_by", createdBy);
    const { data, error } = await q.order("id").range(from, to);
    if (error) throw error;
    return (data ?? []) as Array<{ id?: string; total?: number; created_at?: string }>;
  });
  for (const row of eligibleRows) {
    if (!row.id) continue;
    eligible.add(row.id);
    totalById.set(row.id, Number(row.total ?? 0));
    const ms = row.created_at ? Date.parse(row.created_at) : NaN;
    saleCreatedMsById.set(row.id, Number.isFinite(ms) ? ms : 0);
  }
  if (eligible.size === 0) return { revenue: 0, margin: 0, creditRepayments: 0, byDay };

  // 3) Coût des ventes éligibles → ratio de marge par vente.
  const costById = new Map<string, number>();
  const eligibleIds = [...eligible];
  const costRows = await fetchByChunks(eligibleIds, async (chunk, from, to) => {
    const { data, error } = await supabase
      .from("sale_items")
      .select("sale_id, quantity, product:products(purchase_price)")
      .in("sale_id", chunk)
      .order("id")
      .range(from, to);
    if (error) throw error;
    return (data ?? []) as Array<{
      sale_id?: string;
      quantity?: number;
      product?: { purchase_price?: number } | null;
    }>;
  });
  for (const row of costRows) {
    if (!row.sale_id) continue;
    const qty = Number(row.quantity ?? 0);
    const pp = Number(row.product?.purchase_price ?? 0);
    costById.set(row.sale_id, (costById.get(row.sale_id) ?? 0) + pp * qty);
  }

  // 4) Agrégation : recette = Σ paiements ; marge = Σ paiement × ratio de marge de la vente.
  //    creditRepayments = tout paiement effectué APRÈS la création de la vente (remboursement d'un
  //    crédit — ancien OU pris et remboursé le même jour, même à quelques minutes). Les paiements
  //    « à la vente » sont insérés dans la MÊME transaction que la vente (create_sale_with_stock →
  //    même `now()`, écart ≈ 0) ; tout paiement à un instant distinct est un remboursement.
  const REPAYMENT_GAP_MS = 10_000; // 10 s : absorbe le jitter d'insert, bien en deçà d'un vrai remboursement
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
    const saleMs = saleCreatedMsById.get(p.saleId) ?? 0;
    const payMs = p.createdAt ? Date.parse(p.createdAt) : NaN;
    if (saleMs > 0 && Number.isFinite(payMs) && payMs - saleMs > REPAYMENT_GAP_MS) {
      creditRepayments += rev;
    }
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
  // Paginé — voir `inventory/api.ts` : une troncature fausse les seuils d'alerte.
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

async function fetchSaleItemsForSaleIds(
  supabase: ReturnType<typeof createClient>,
  saleIds: string[],
): Promise<SaleItemRow[]> {
  if (saleIds.length === 0) return [];
  return fetchByChunks(saleIds, async (chunk, from, to) => {
    const { data, error } = await supabase
      .from("sale_items")
      .select(
        "sale_id, product_id, quantity, total, product:products(id, name, purchase_price, category_id, category:categories(id, name))",
      )
      .in("sale_id", chunk)
      .order("id")
      .range(from, to);
    if (error) throw error;
    return (data ?? []) as SaleItemRow[];
  });
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
  return fetchByChunks(saleIds, async (chunk, from, to) => {
    const { data, error } = await supabase
      .from("sales")
      .select("id, created_at, total")
      .in("id", chunk)
      .order("id")
      .range(from, to);
    if (error) throw error;
    return (data ?? []) as Array<{ id: string; created_at: string; total: number }>;
  });
}

async function computeSalesSummaryFiltered(
  supabase: ReturnType<typeof createClient>,
  matchedSaleIds: string[],
  filteredItems: SaleItemRow[],
  ratioById: Map<string, number>,
): Promise<SalesSummary> {
  if (matchedSaleIds.length === 0) return emptySummary();
  const rows = await fetchByChunks(matchedSaleIds, async (chunk, from, to) => {
    const { data, error } = await supabase
      .from("sales")
      .select("id, total")
      .in("id", chunk)
      .order("id")
      .range(from, to);
    if (error) throw error;
    return (data ?? []) as Array<{ id?: string; total?: number }>;
  });
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

  // Paginé : ce rapport liste les ruptures. Tronqué, il en **cachait** — un produit en
  // rupture qui n'apparaît pas est exactement ce que le rapport doit empêcher.
  const { data: inv, error: invErr } = await fetchAllPages((from, to) =>
    supabase
      .from("store_inventory")
      .select("product_id, quantity, product:products(id, name, stock_min)")
      .eq("store_id", storeId)
      .order("product_id", { ascending: true })
      .range(from, to),
  );
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

  // Paginé : chaque vente produit un mouvement de sortie. Le total entrées/sorties de la
  // période dépasse donc 1000 lignes chez toute boutique un peu active.
  const { data: movements, error: movErr } = await fetchAllPages((from, to) =>
    supabase
      .from("stock_movements")
      .select("quantity, created_at")
      .eq("store_id", storeId)
      .gte("created_at", localDayStartIso(fromDate))
      .lte("created_at", localDayEndIso(toDate))
      .order("id", { ascending: true })
      .range(from, to),
  );
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

  const previousSummary = await computePreviousReportsSummary({
    supabase,
    companyId,
    storeId,
    fromDate,
    toDate,
    cashierUserId,
    productId,
    categoryId,
  });

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
    previousSummary,
  };
}

/**
 * Synthèse de la période précédente de même durée — sert uniquement aux deltas
 * « vs période précédente » affichés sur les cartes KPI. Même logique de
 * reconnaissance (caisse hors filtre produit/catégorie, prorata sinon).
 */
async function computePreviousReportsSummary(params: {
  supabase: ReturnType<typeof createClient>;
  companyId: string;
  storeId: string | null;
  fromDate: string;
  toDate: string;
  cashierUserId: string | null;
  productId: string | null;
  categoryId: string | null;
}): Promise<SalesSummary> {
  const {
    supabase,
    companyId,
    storeId,
    fromDate,
    toDate,
    cashierUserId,
    productId,
    categoryId,
  } = params;
  const prev = getPreviousComparableRange({ from: fromDate, to: toDate });
  const prevSaleIds = await fetchSalesIdsInRange(
    supabase,
    companyId,
    storeId,
    prev.from,
    prev.to,
    cashierUserId,
  );
  const prevItems = filterSaleItems(
    await fetchSaleItemsForSaleIds(supabase, prevSaleIds),
    productId,
    categoryId,
  );
  const prevMatched = [...new Set(prevItems.map((i) => i.sale_id))];
  const prevRatios = await fetchSaleRecognitionRatios(supabase, prevMatched);
  const base = await computeSalesSummaryFiltered(
    supabase,
    prevMatched,
    prevItems,
    prevRatios,
  );
  if (productId || categoryId) return base;
  const cash = await fetchCashRecognizedInRange(
    supabase,
    companyId,
    storeId,
    prev.from,
    prev.to,
    cashierUserId,
  );
  return { ...base, totalAmount: cash.revenue, margin: cash.margin };
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Espèces",
  mobile_money: "Mobile Money",
  card: "Carte",
  transfer: "Virement",
  other: "Crédit / autre",
};

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

/**
 * Performance par membre de l'équipe — « qui a vendu combien ».
 *
 * Deux angles complémentaires, volontairement distincts :
 *  • activité (nb ventes, articles, remises, crédit accordé, heures) = ventes
 *    CRÉÉES sur la période par la personne ;
 *  • recette (CA encaissé, marge) = argent RÉELLEMENT encaissé sur la période sur
 *    ses ventes, remboursements de ses anciens crédits inclus — même logique
 *    caisse que la carte « CA encaissé » de la page.
 */
export async function fetchTeamPerformance(params: {
  companyId: string;
  storeId: string | null;
  fromDate: string;
  toDate: string;
}): Promise<TeamPerformanceData> {
  const supabase = createClient();
  const { companyId, storeId, fromDate, toDate } = params;

  // 1) Ventes créées sur la période (activité). Paginé : tronquée, la comparaison entre
  //    caissiers devenait arbitraire — celui dont les ventes tombaient après la 1000ᵉ
  //    ligne apparaissait moins performant qu'il ne l'est.
  const { data: salesRaw, error: salesErr } = await fetchAllPages((from, to) => {
    let salesQ = supabase
      .from("sales")
      .select("id, created_at, total, discount, created_by, store_id")
      .eq("company_id", companyId)
      .eq("status", "completed")
      .gte("created_at", localDayStartIso(fromDate))
      .lte("created_at", localDayEndIso(toDate))
      .order("id", { ascending: true });
    if (storeId) salesQ = salesQ.eq("store_id", storeId);
    return salesQ.range(from, to);
  });
  if (salesErr) throw salesErr;
  const periodSales = ((salesRaw ?? []) as Array<{
    id: string;
    created_at: string;
    total?: number;
    discount?: number;
    created_by?: string;
    store_id?: string;
  }>).filter((s) => Boolean(s.created_by));

  const periodSaleIds = periodSales.map((s) => s.id);
  const sellerBySaleId = new Map<string, string>();
  for (const s of periodSales) sellerBySaleId.set(s.id, String(s.created_by));

  // 2) Encaissements de la période (recette) — peuvent porter sur des ventes
  //    antérieures (remboursement de crédit) : on remonte à leur vendeur.
  const { data: payRaw, error: payErr } = await fetchAllPages((from, to) =>
    supabase
      .from("sale_payments")
      .select("sale_id, amount, method, created_at")
      .neq("method", "other")
      .gte("created_at", localDayStartIso(fromDate))
      .lte("created_at", localDayEndIso(toDate))
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (payErr) throw payErr;
  const rangePayments = ((payRaw ?? []) as Array<{
    sale_id?: string;
    amount?: number;
    method?: string;
    created_at?: string;
  }>).filter((p) => p.sale_id);

  const externalSaleIds = [
    ...new Set(
      rangePayments
        .map((p) => String(p.sale_id))
        .filter((id) => !sellerBySaleId.has(id)),
    ),
  ];
  const externalSaleMeta = new Map<
    string,
    { total: number; sellerId: string; createdMs: number }
  >();
  const externalSaleRows = await fetchByChunks(externalSaleIds, async (chunk, from, to) => {
    let q = supabase
      .from("sales")
      .select("id, total, created_by, created_at, store_id")
      .in("id", chunk)
      .eq("company_id", companyId)
      .eq("status", "completed");
    if (storeId) q = q.eq("store_id", storeId);
    const { data, error } = await q.order("id").range(from, to);
    if (error) throw error;
    return (data ?? []) as Array<{
      id?: string;
      total?: number;
      created_by?: string;
      created_at?: string;
    }>;
  });
  for (const row of externalSaleRows) {
    if (!row.id || !row.created_by) continue;
    externalSaleMeta.set(row.id, {
      total: Number(row.total ?? 0),
      sellerId: String(row.created_by),
      createdMs: row.created_at ? Date.parse(row.created_at) : 0,
    });
  }

  // 3) Lignes de vente de la période → articles, marge, top produits, coût.
  const items = await fetchSaleItemsForSaleIds(supabase, periodSaleIds);

  // Coût des ventes concernées par un encaissement externe (marge des remboursements).
  const externalCost = new Map<string, number>();
  const externalIds = [...externalSaleMeta.keys()];
  const externalCostRows = await fetchByChunks(externalIds, async (chunk, from, to) => {
    const { data, error } = await supabase
      .from("sale_items")
      .select("sale_id, quantity, product:products(purchase_price)")
      .in("sale_id", chunk)
      .order("id")
      .range(from, to);
    if (error) throw error;
    return (data ?? []) as Array<{
      sale_id?: string;
      quantity?: number;
      product?: { purchase_price?: number } | null;
    }>;
  });
  for (const row of externalCostRows) {
    if (!row.sale_id) continue;
    externalCost.set(
      row.sale_id,
      (externalCost.get(row.sale_id) ?? 0) +
        Number(row.product?.purchase_price ?? 0) * Number(row.quantity ?? 0),
    );
  }

  // 4) Encaissé total par vente de la période → crédit restant dû.
  const paidByPeriodSale = new Map<string, number>();
  const periodPaymentRows = await fetchByChunks(periodSaleIds, async (chunk, from, to) => {
    const { data, error } = await supabase
      .from("sale_payments")
      .select("sale_id, method, amount")
      .in("sale_id", chunk)
      .order("id")
      .range(from, to);
    if (error) throw error;
    return (data ?? []) as Array<{
      sale_id?: string;
      method?: string;
      amount?: number;
    }>;
  });
  for (const row of periodPaymentRows) {
    if (!row.sale_id || row.method === "other") continue;
    paidByPeriodSale.set(
      row.sale_id,
      (paidByPeriodSale.get(row.sale_id) ?? 0) + Number(row.amount ?? 0),
    );
  }

  const storeNameById = new Map<string, string>();
  {
    const { data } = await supabase
      .from("stores")
      .select("id, name")
      .eq("company_id", companyId);
    for (const s of (data ?? []) as Array<{ id?: string; name?: string }>) {
      if (s.id) storeNameById.set(s.id, String(s.name ?? "—"));
    }
  }

  // 5) Agrégation par vendeur.
  type Acc = {
    revenue: number;
    margin: number;
    salesCount: number;
    itemsSold: number;
    billedTotal: number;
    discountTotal: number;
    creditOutstanding: number;
    creditRepayments: number;
    byDay: Map<string, { total: number; count: number }>;
    byHour: Map<number, { count: number; revenue: number }>;
    payments: Map<string, { amount: number; count: number }>;
    products: Map<string, { name: string; qty: number; revenue: number; cost: number }>;
    days: Set<string>;
    stores: Set<string>;
    firstMs: number | null;
    lastMs: number | null;
  };
  const acc = new Map<string, Acc>();
  const ensure = (userId: string): Acc => {
    let a = acc.get(userId);
    if (!a) {
      a = {
        revenue: 0,
        margin: 0,
        salesCount: 0,
        itemsSold: 0,
        billedTotal: 0,
        discountTotal: 0,
        creditOutstanding: 0,
        creditRepayments: 0,
        byDay: new Map(),
        byHour: new Map(),
        payments: new Map(),
        products: new Map(),
        days: new Set(),
        stores: new Set(),
        firstMs: null,
        lastMs: null,
      };
      acc.set(userId, a);
    }
    return a;
  };

  const totalBySaleId = new Map<string, number>();
  const createdMsBySaleId = new Map<string, number>();
  for (const s of periodSales) {
    const sellerId = String(s.created_by);
    const a = ensure(sellerId);
    const total = Number(s.total ?? 0);
    totalBySaleId.set(s.id, total);
    a.salesCount += 1;
    a.billedTotal += total;
    a.discountTotal += Number(s.discount ?? 0);
    a.creditOutstanding += Math.max(0, total - (paidByPeriodSale.get(s.id) ?? 0));
    const day = s.created_at ? localDateFromIso(s.created_at) : "";
    if (day) {
      a.days.add(day);
      const cur = a.byDay.get(day) ?? { total: 0, count: 0 };
      a.byDay.set(day, { total: cur.total, count: cur.count + 1 });
    }
    const ms = s.created_at ? Date.parse(s.created_at) : NaN;
    if (Number.isFinite(ms)) {
      createdMsBySaleId.set(s.id, ms);
      a.firstMs = a.firstMs === null ? ms : Math.min(a.firstMs, ms);
      a.lastMs = a.lastMs === null ? ms : Math.max(a.lastMs, ms);
      const hour = new Date(ms).getHours();
      const h = a.byHour.get(hour) ?? { count: 0, revenue: 0 };
      a.byHour.set(hour, { count: h.count + 1, revenue: h.revenue + total });
    }
    if (s.store_id) a.stores.add(storeNameById.get(s.store_id) ?? "—");
  }

  // Coût par vente de la période (pour le ratio de marge) + top produits.
  const costBySaleId = new Map<string, number>();
  for (const row of items) {
    const sellerId = sellerBySaleId.get(row.sale_id);
    const qty = Number(row.quantity ?? 0);
    const lineTotal = Number(row.total ?? 0);
    const cost = Number(row.product?.purchase_price ?? 0) * qty;
    costBySaleId.set(row.sale_id, (costBySaleId.get(row.sale_id) ?? 0) + cost);
    if (!sellerId) continue;
    const a = ensure(sellerId);
    a.itemsSold += qty;
    const pid = row.product_id;
    if (!pid) continue;
    const cur =
      a.products.get(pid) ?? {
        name: row.product?.name ?? "—",
        qty: 0,
        revenue: 0,
        cost: 0,
      };
    a.products.set(pid, {
      name: cur.name,
      qty: cur.qty + qty,
      revenue: cur.revenue + lineTotal,
      cost: cur.cost + cost,
    });
  }

  const REPAYMENT_GAP_MS = 10_000;
  for (const p of rangePayments) {
    const saleId = String(p.sale_id);
    const amount = Number(p.amount ?? 0);
    const method = String(p.method ?? "cash");
    let sellerId: string | undefined;
    let total = 0;
    let cost = 0;
    let saleMs = 0;
    if (sellerBySaleId.has(saleId)) {
      sellerId = sellerBySaleId.get(saleId);
      total = totalBySaleId.get(saleId) ?? 0;
      cost = costBySaleId.get(saleId) ?? 0;
      saleMs = createdMsBySaleId.get(saleId) ?? 0;
    } else {
      const meta = externalSaleMeta.get(saleId);
      if (!meta) continue;
      sellerId = meta.sellerId;
      total = meta.total;
      cost = externalCost.get(saleId) ?? 0;
      saleMs = meta.createdMs;
    }
    if (!sellerId) continue;
    const a = ensure(sellerId);
    const marginRatio =
      total > 0 ? Math.max(0, Math.min(1, (total - cost) / total)) : 0;
    a.revenue += amount;
    a.margin += amount * marginRatio;
    const pm = a.payments.get(method) ?? { amount: 0, count: 0 };
    a.payments.set(method, { amount: pm.amount + amount, count: pm.count + 1 });
    const payMs = p.created_at ? Date.parse(p.created_at) : NaN;
    if (saleMs > 0 && Number.isFinite(payMs) && payMs - saleMs > REPAYMENT_GAP_MS) {
      a.creditRepayments += amount;
    }
    const day = p.created_at ? localDateFromIso(p.created_at) : "";
    if (day) {
      const cur = a.byDay.get(day) ?? { total: 0, count: 0 };
      a.byDay.set(day, { total: cur.total + amount, count: cur.count });
    }
  }

  // 6) Identités (nom + rôle).
  const userIds = [...acc.keys()];
  const nameById = new Map<string, string>();
  const roleById = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    for (const p of (profiles ?? []) as Array<{ id?: string; full_name?: string | null }>) {
      if (p.id && p.full_name?.trim()) nameById.set(p.id, p.full_name.trim());
    }
    const { data: roles } = await supabase
      .from("user_company_roles")
      .select("user_id, role:roles(name, slug)")
      .eq("company_id", companyId)
      .in("user_id", userIds);
    for (const r of (roles ?? []) as Array<{
      user_id?: string;
      role?: { name?: string; slug?: string } | { name?: string; slug?: string }[] | null;
    }>) {
      const raw = Array.isArray(r.role) ? r.role[0] : r.role;
      if (r.user_id && raw) {
        roleById.set(r.user_id, String(raw.name ?? raw.slug ?? "Utilisateur"));
      }
    }
  }

  const cashiers = userIds.map((userId) => {
    const a = acc.get(userId)!;
    const byDay = [...a.byDay.entries()]
      .map(([date, v]) => ({ date, total: v.total, count: v.count }))
      .sort((x, y) => x.date.localeCompare(y.date));
    const byHour = Array.from({ length: 24 }, (_, hour) => {
      const v = a.byHour.get(hour);
      return { hour, count: v?.count ?? 0, revenue: v?.revenue ?? 0 };
    });
    const payments = [...a.payments.entries()]
      .map(([method, v]) => ({ method, amount: v.amount, count: v.count }))
      .sort((x, y) => y.amount - x.amount);
    const topProducts = [...a.products.entries()]
      .map(([productId, v]) => ({
        productId,
        productName: v.name,
        quantitySold: v.qty,
        revenue: v.revenue,
        margin: v.revenue - v.cost,
      }))
      .sort((x, y) => y.revenue - x.revenue)
      .slice(0, 5);
    return {
      userId,
      displayName: nameById.get(userId) ?? `Utilisateur ${userId.slice(0, 6)}`,
      roleName: roleById.get(userId) ?? "Utilisateur",
      revenue: a.revenue,
      margin: a.margin,
      marginRatePercent: a.revenue > 0 ? (a.margin / a.revenue) * 100 : 0,
      salesCount: a.salesCount,
      itemsSold: a.itemsSold,
      ticketAverage: a.salesCount > 0 ? a.billedTotal / a.salesCount : 0,
      billedTotal: a.billedTotal,
      discountTotal: a.discountTotal,
      creditOutstanding: a.creditOutstanding,
      creditRepayments: a.creditRepayments,
      byDay,
      byHour,
      payments,
      topProducts,
      activeDays: a.days.size,
      firstSaleAt: a.firstMs === null ? null : new Date(a.firstMs).toISOString(),
      lastSaleAt: a.lastMs === null ? null : new Date(a.lastMs).toISOString(),
      storeNames: [...a.stores],
    } satisfies CashierPerformance;
  });

  cashiers.sort((x, y) => y.revenue - x.revenue || y.billedTotal - x.billedTotal);

  const totals = cashiers.reduce(
    (t, c) => ({
      revenue: t.revenue + c.revenue,
      margin: t.margin + c.margin,
      salesCount: t.salesCount + c.salesCount,
      itemsSold: t.itemsSold + c.itemsSold,
      billedTotal: t.billedTotal + c.billedTotal,
      creditOutstanding: t.creditOutstanding + c.creditOutstanding,
    }),
    {
      revenue: 0,
      margin: 0,
      salesCount: 0,
      itemsSold: 0,
      billedTotal: 0,
      creditOutstanding: 0,
    },
  );

  return { cashiers, totals };
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
    // Découpé : c'est précisément ce `.in()` qui faisait tomber le tableau de bord en
    // erreur (URL trop longue) dès que la période dépassait quelques centaines de ventes.
    const salesRows = await fetchByChunks(saleIds, async (chunk, from, to) => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, created_at, total")
        .in("id", chunk)
        .order("id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; created_at: string; total: number }>;
    });
    salesByDayComputed = computeSalesByDay(salesRows, ratioById);
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

  // Listes du tableau de bord : le propriétaire scrolle dans les cartes, on
  // envoie donc plus que le podium (agrégat déjà en mémoire → aucune requête
  // supplémentaire), tout en bornant la charge utile.
  const OWNER_LIST_LIMIT = 20;
  const byRev = [...productAgg].sort((a, b) => b.revenue - a.revenue);
  const topProducts = byRev.slice(0, OWNER_LIST_LIMIT);
  const topByMargin = [...productAgg]
    .sort((a, b) => b.margin - a.margin)
    .slice(0, OWNER_LIST_LIMIT);
  const leastByRevenue = [...productAgg]
    .filter((p) => p.revenue > 0)
    .sort((a, b) => a.revenue - b.revenue)
    .slice(0, 10);

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
