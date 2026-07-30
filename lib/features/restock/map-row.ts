import type { RestockCandidate, RestockUrgency } from "./types";

/**
 * Conversion d'une ligne `restock_candidates` (snake_case SQL) vers le modèle web.
 *
 * Volontairement dans un module **neutre** (ni client ni serveur) : la page l'utilise
 * côté navigateur, et la route IA `/api/ai/restock` la réutilise côté serveur pour
 * recalculer les candidats elle-même au lieu de faire confiance au client.
 */

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toNullableNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toStr(v: unknown): string {
  return v == null ? "" : String(v);
}

function toNullableStr(v: unknown): string | null {
  const s = v == null ? "" : String(v).trim();
  return s === "" ? null : s;
}

function toUrgency(v: unknown): RestockUrgency {
  const s = toStr(v);
  if (s === "rupture" || s === "critique") return s;
  return "a_surveiller";
}

export function mapRestockRow(row: Record<string, unknown>): RestockCandidate {
  return {
    productId: toStr(row.product_id),
    productName: toStr(row.product_name),
    sku: toNullableStr(row.sku),
    unit: toStr(row.unit) || "pce",
    categoryName: toNullableStr(row.category_name),
    stock: toNum(row.stock),
    stockMin: toNum(row.stock_min),
    soldQty: toNum(row.sold_qty),
    salesCount: toNum(row.sales_count),
    revenue: toNum(row.revenue),
    dailyRate: toNum(row.daily_rate),
    coverDays: toNullableNum(row.cover_days),
    suggestedQty: Math.max(1, Math.round(toNum(row.suggested_qty))),
    salePrice: toNum(row.sale_price),
    purchasePrice: toNum(row.purchase_price),
    lastPurchasePrice: toNullableNum(row.last_purchase_price),
    lastPurchaseAt: row.last_purchase_at != null ? String(row.last_purchase_at) : null,
    supplierId: toNullableStr(row.supplier_id),
    supplierName: toNullableStr(row.supplier_name),
    urgency: toUrgency(row.urgency),
  };
}
