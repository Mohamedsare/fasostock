"use client";

import { createClient } from "@/lib/supabase/client";
import { mapSupabaseError } from "@/lib/supabase/map-error";
import type {
  AllocationMethod,
  BatchTotals,
  ChargeKind,
  ComputedLine,
  CostBatch,
  CostBatchCharge,
  CostBatchItem,
  CostingMethod,
  MarginMode,
  PriceChange,
  StockMode,
} from "./types";

function toStr(v: unknown): string {
  return v == null ? "" : String(v);
}

function toNullableStr(v: unknown): string | null {
  const s = toStr(v).trim();
  return s === "" ? null : s;
}

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toNullableNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lecture
// ─────────────────────────────────────────────────────────────────────────────

export async function listCostBatches(params: {
  companyId: string;
  storeId: string | null;
}): Promise<CostBatch[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("cost_batches_overview", {
    p_company_id: params.companyId,
    p_store_id: params.storeId,
    p_limit: 200,
  });
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: toStr(r.id),
    storeId: toStr(r.store_id),
    storeName: toStr(r.store_name),
    supplierId: toNullableStr(r.supplier_id),
    supplierName: toNullableStr(r.supplier_name),
    label: toStr(r.label),
    reference: toNullableStr(r.reference),
    status: toStr(r.status) as CostBatch["status"],
    stockMode: toStr(r.stock_mode) as StockMode,
    costingMethod: toStr(r.costing_method) as CostingMethod,
    allocationMethod: toStr(r.allocation_method) as AllocationMethod,
    currencyCode: toStr(r.currency_code) || "XOF",
    exchangeRate: toNum(r.exchange_rate) || 1,
    rounding: toNum(r.rounding),
    marginMode: toStr(r.margin_mode) as MarginMode,
    marginValue: toNum(r.margin_value),
    orderedAt: toNullableStr(r.ordered_at),
    receivedAt: toNullableStr(r.received_at),
    notes: toNullableStr(r.notes),
    itemsCount: toNum(r.items_count),
    totalQuantity: toNum(r.total_quantity),
    goodsTotal: toNum(r.goods_total),
    chargesTotal: toNum(r.charges_total),
    landedTotal: toNum(r.landed_total),
    appliedAt: toNullableStr(r.applied_at),
    pricesRevertedAt: toNullableStr(r.prices_reverted_at),
    createdAt: toStr(r.created_at),
  }));
}

export async function fetchBatchItems(batchId: string): Promise<CostBatchItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cost_batch_items")
    .select(
      "id, product_id, quantity, unit_price, weight_kg, volume_m3, manual_share, margin_mode, margin_value, apply_sale_price, sort_order, prev_purchase_price, prev_sale_price, applied_purchase_price, applied_sale_price, product:products(name)",
    )
    .eq("batch_id", batchId)
    .order("sort_order", { ascending: true });
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const raw = r.product as { name?: string } | { name?: string }[] | null;
    const productName = Array.isArray(raw)
      ? toStr(raw[0]?.name)
      : toStr((raw ?? {}).name);
    return {
      id: toStr(r.id),
      productId: toStr(r.product_id),
      productName,
      quantity: toNum(r.quantity),
      unitPrice: toNum(r.unit_price),
      weightKg: toNullableNum(r.weight_kg),
      volumeM3: toNullableNum(r.volume_m3),
      manualShare: toNullableNum(r.manual_share),
      marginMode: (toNullableStr(r.margin_mode) as MarginMode | null) ?? null,
      marginValue: toNullableNum(r.margin_value),
      applySalePrice: r.apply_sale_price !== false,
      sortOrder: toNum(r.sort_order),
      prevPurchasePrice: toNullableNum(r.prev_purchase_price),
      prevSalePrice: toNullableNum(r.prev_sale_price),
      appliedPurchasePrice: toNullableNum(r.applied_purchase_price),
      appliedSalePrice: toNullableNum(r.applied_sale_price),
    };
  });
}

export async function fetchBatchCharges(batchId: string): Promise<CostBatchCharge[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cost_batch_charges")
    .select("id, label, kind, amount, allocation_method, sort_order")
    .eq("batch_id", batchId)
    .order("sort_order", { ascending: true });
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: toStr(r.id),
    label: toStr(r.label),
    kind: toStr(r.kind) as ChargeKind,
    amount: toNum(r.amount),
    allocationMethod: (toNullableStr(r.allocation_method) as AllocationMethod | null) ?? null,
    sortOrder: toNum(r.sort_order),
  }));
}

/**
 * LE calcul, fait par le serveur. L'écran ne recalcule jamais un coût de revient
 * dans son coin : ce qui s'affiche est exactement ce que l'application écrira.
 */
export async function computeBatch(batchId: string): Promise<ComputedLine[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("cost_batch_compute", {
    p_batch_id: batchId,
  });
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    itemId: toStr(r.item_id),
    productId: toStr(r.product_id),
    productName: toStr(r.product_name),
    unit: toStr(r.unit) || "pce",
    sortOrder: toNum(r.sort_order),
    quantity: toNum(r.quantity),
    unitPrice: toNum(r.unit_price),
    goodsTotal: toNum(r.goods_total),
    allocatedCharges: toNum(r.allocated_charges),
    landedTotal: toNum(r.landed_total),
    unitLandedCost: toNum(r.unit_landed_cost),
    stockBefore: toNum(r.stock_before),
    currentPurchasePrice: toNum(r.current_purchase_price),
    currentSalePrice: toNum(r.current_sale_price),
    weightedCost: toNum(r.weighted_cost),
    retainedCost: toNum(r.retained_cost),
    marginMode: toStr(r.margin_mode) as MarginMode,
    marginValue: toNum(r.margin_value),
    suggestedSalePrice: toNum(r.suggested_sale_price),
    marginAmount: toNum(r.margin_amount),
    marginRate: toNum(r.margin_rate),
    applySalePrice: r.apply_sale_price !== false,
  }));
}

export async function fetchPriceHistory(productId: string): Promise<PriceChange[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("product_price_history", {
    p_product_id: productId,
    p_limit: 30,
  });
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: toStr(r.id),
    createdAt: toStr(r.created_at),
    source: toStr(r.source) === "cost_batch_revert" ? "cost_batch_revert" : "cost_batch",
    batchId: toNullableStr(r.batch_id),
    batchLabel: toNullableStr(r.batch_label),
    oldPurchasePrice: toNullableNum(r.old_purchase_price),
    newPurchasePrice: toNullableNum(r.new_purchase_price),
    oldSalePrice: toNullableNum(r.old_sale_price),
    newSalePrice: toNullableNum(r.new_sale_price),
    stockAtChange: toNullableNum(r.stock_at_change),
    authorName: toNullableStr(r.author_name),
  }));
}

/** Achats déjà saisis, proposés à l'import dans un arrivage (évite la re-saisie). */
export async function listImportablePurchases(params: {
  companyId: string;
  storeId: string | null;
}): Promise<{ id: string; label: string }[]> {
  const supabase = createClient();
  let q = supabase
    .from("purchases")
    .select("id, reference, total, created_at, supplier:suppliers(name)")
    .eq("company_id", params.companyId)
    .in("status", ["received", "confirmed", "partially_received"])
    .order("created_at", { ascending: false })
    .limit(50);
  if (params.storeId) q = q.eq("store_id", params.storeId);
  const { data, error } = await q;
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const raw = r.supplier as { name?: string } | { name?: string }[] | null;
    const supplierName = Array.isArray(raw) ? toStr(raw[0]?.name) : toStr((raw ?? {}).name);
    const date = toStr(r.created_at).slice(0, 10).split("-").reverse().join("/");
    const ref = toNullableStr(r.reference) ?? "sans référence";
    return {
      id: toStr(r.id),
      label: `${ref} · ${supplierName || "Fournisseur inconnu"} · ${date}`,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Écriture — toujours par RPC : les gardes (module actif, droit, statut) vivent
// côté serveur, jamais dans l'écran.
// ─────────────────────────────────────────────────────────────────────────────

export async function saveCostBatch(params: {
  id: string | null;
  storeId: string;
  supplierId: string | null;
  label: string;
  reference: string | null;
  stockMode: StockMode;
  costingMethod: CostingMethod;
  allocationMethod: AllocationMethod;
  currencyCode: string;
  exchangeRate: number;
  rounding: number;
  marginMode: MarginMode;
  marginValue: number;
  orderedAt: string | null;
  receivedAt: string | null;
  notes: string | null;
}): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("cost_batch_save", {
    p_id: params.id,
    p_store_id: params.storeId,
    p_supplier_id: params.supplierId,
    p_label: params.label,
    p_reference: params.reference,
    p_stock_mode: params.stockMode,
    p_costing_method: params.costingMethod,
    p_allocation_method: params.allocationMethod,
    p_currency_code: params.currencyCode,
    p_exchange_rate: params.exchangeRate,
    p_rounding: params.rounding,
    p_margin_mode: params.marginMode,
    p_margin_value: params.marginValue,
    p_ordered_at: params.orderedAt,
    p_received_at: params.receivedAt,
    p_notes: params.notes,
  });
  if (error) throw mapSupabaseError(error);
  return toStr(data);
}

export async function deleteCostBatch(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("cost_batch_delete", { p_id: id });
  if (error) throw mapSupabaseError(error);
}

export async function cancelCostBatch(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("cost_batch_cancel", { p_id: id });
  if (error) throw mapSupabaseError(error);
}

export async function duplicateCostBatch(id: string, label?: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("cost_batch_duplicate", {
    p_id: id,
    p_label: label ?? null,
  });
  if (error) throw mapSupabaseError(error);
  return toStr(data);
}

export async function saveBatchItem(params: {
  id: string | null;
  batchId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  weightKg: number | null;
  volumeM3: number | null;
  manualShare: number | null;
  marginMode: MarginMode | null;
  marginValue: number | null;
  applySalePrice: boolean;
}): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("cost_batch_item_save", {
    p_id: params.id,
    p_batch_id: params.batchId,
    p_product_id: params.productId,
    p_quantity: params.quantity,
    p_unit_price: params.unitPrice,
    p_weight_kg: params.weightKg,
    p_volume_m3: params.volumeM3,
    p_manual_share: params.manualShare,
    p_margin_mode: params.marginMode,
    p_margin_value: params.marginValue,
    p_apply_sale_price: params.applySalePrice,
  });
  if (error) throw mapSupabaseError(error);
  return toStr(data);
}

export async function deleteBatchItem(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("cost_batch_item_delete", { p_id: id });
  if (error) throw mapSupabaseError(error);
}

/** Reprend les lignes d'un achat déjà saisi ; bascule le lot en « prix seulement ». */
export async function importItemsFromPurchase(
  batchId: string,
  purchaseId: string,
): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("cost_batch_items_import_from_purchase", {
    p_batch_id: batchId,
    p_purchase_id: purchaseId,
  });
  if (error) throw mapSupabaseError(error);
  return toNum(data);
}

export async function saveBatchCharge(params: {
  id: string | null;
  batchId: string;
  label: string;
  kind: ChargeKind;
  amount: number;
  allocationMethod: AllocationMethod | null;
}): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("cost_batch_charge_save", {
    p_id: params.id,
    p_batch_id: params.batchId,
    p_label: params.label,
    p_kind: params.kind,
    p_amount: params.amount,
    p_allocation_method: params.allocationMethod,
  });
  if (error) throw mapSupabaseError(error);
  return toStr(data);
}

export async function deleteBatchCharge(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("cost_batch_charge_delete", { p_id: id });
  if (error) throw mapSupabaseError(error);
}

/** Applique l'arrivage (stock + prix, tout ou rien). Renvoie le nombre de lignes traitées. */
export async function applyCostBatch(id: string): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("cost_batch_apply", { p_batch_id: id });
  if (error) throw mapSupabaseError(error);
  return toNum(data);
}

/** Remet les prix d'avant. Le stock, lui, n'est jamais touché. */
export async function revertBatchPrices(id: string): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("cost_batch_revert_prices", {
    p_batch_id: id,
  });
  if (error) throw mapSupabaseError(error);
  return toNum(data);
}

/** Réglage entreprise « module Prix de revient » — écrit par le propriétaire. */
export async function setLandedCostEnabled(
  companyId: string,
  enabled: boolean,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("company_set_landed_cost_enabled", {
    p_company_id: companyId,
    p_enabled: enabled,
  });
  if (error) throw mapSupabaseError(error);
}

// ─────────────────────────────────────────────────────────────────────────────
// Agrégats d'écran
// ─────────────────────────────────────────────────────────────────────────────

/** Totaux du pied de tableau, calculés à partir des lignes RENVOYÉES PAR LE SERVEUR. */
export function batchTotals(lines: ComputedLine[]): BatchTotals {
  let goods = 0;
  let charges = 0;
  let quantity = 0;
  let expectedRevenue = 0;
  for (const l of lines) {
    goods += l.goodsTotal;
    charges += l.allocatedCharges;
    quantity += l.quantity;
    expectedRevenue += l.suggestedSalePrice * l.quantity;
  }
  const landed = goods + charges;
  return {
    goods,
    charges,
    landed,
    quantity,
    chargesRate: landed > 0 ? (charges / landed) * 100 : 0,
    expectedRevenue,
    expectedMargin: expectedRevenue - landed,
  };
}
