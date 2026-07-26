"use client";

import { createClient } from "@/lib/supabase/client";
import { mapSupabaseError } from "@/lib/supabase/map-error";
import type {
  WarehouseInventorySession,
  WarehouseInventorySessionItem,
  WarehouseInventorySessionStatus,
  WarehouseInventorySessionSummary,
} from "./types";

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toStatus(v: unknown): WarehouseInventorySessionStatus {
  return v === "closed" || v === "cancelled" ? v : "open";
}

/** Liste des sessions d'inventaire d'un dépôt (avec agrégats). */
export async function listWarehouseInventorySessions(params: {
  companyId: string;
  warehouseId: string | null;
}): Promise<WarehouseInventorySessionSummary[]> {
  if (!params.companyId) return [];
  const supabase = createClient();
  const { data, error } = await supabase.rpc("warehouse_inventory_session_list", {
    p_company_id: params.companyId,
    p_warehouse_id: params.warehouseId ?? null,
  });
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id ?? ""),
    warehouseId: String(r.warehouse_id ?? ""),
    status: toStatus(r.status),
    note: r.note != null ? String(r.note) : null,
    startedAt: String(r.started_at ?? ""),
    closedAt: r.closed_at != null ? String(r.closed_at) : null,
    createdBy: String(r.created_by ?? ""),
    itemCount: toNum(r.item_count),
    countedCount: toNum(r.counted_count),
    varianceCount: toNum(r.variance_count),
    varianceValuePurchase: toNum(r.variance_value_purchase),
  }));
}

/** En-tête d'une session. */
export async function getWarehouseInventorySession(
  sessionId: string,
): Promise<WarehouseInventorySession | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("warehouse_inventory_sessions")
    .select("id, warehouse_id, company_id, status, note, started_at, closed_at, created_by")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: String(r.id ?? ""),
    warehouseId: String(r.warehouse_id ?? ""),
    companyId: String(r.company_id ?? ""),
    status: toStatus(r.status),
    note: r.note != null ? String(r.note) : null,
    startedAt: String(r.started_at ?? ""),
    closedAt: r.closed_at != null ? String(r.closed_at) : null,
    createdBy: String(r.created_by ?? ""),
  };
}

/** Lignes de comptage d'une session (triées par nom produit). */
export async function listWarehouseInventorySessionItems(
  sessionId: string,
): Promise<WarehouseInventorySessionItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("warehouse_inventory_session_items")
    .select("id, product_id, product_name, expected_qty, counted_qty, variance, unit_purchase_price, counted_at")
    .eq("session_id", sessionId)
    .order("product_name", { ascending: true });
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id ?? ""),
    productId: String(r.product_id ?? ""),
    productName: String(r.product_name ?? "Produit"),
    expectedQty: toNum(r.expected_qty),
    countedQty: r.counted_qty != null ? toNum(r.counted_qty) : null,
    variance: r.variance != null ? toNum(r.variance) : null,
    unitPurchasePrice: toNum(r.unit_purchase_price),
    countedAt: r.counted_at != null ? String(r.counted_at) : null,
  }));
}

/** Démarre une session : snapshot du stock théorique du dépôt. Retourne l'id de session. */
export async function startWarehouseInventorySession(params: {
  companyId: string;
  warehouseId: string | null;
  note?: string | null;
}): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("warehouse_inventory_session_start", {
    p_company_id: params.companyId,
    p_warehouse_id: params.warehouseId ?? null,
    p_note: params.note?.trim() || null,
  });
  if (error) throw mapSupabaseError(error);
  return String(data ?? "");
}

/** Saisit la quantité comptée d'une ligne. */
export async function setWarehouseInventoryCount(params: {
  itemId: string;
  countedQty: number;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("warehouse_inventory_session_set_count", {
    p_item_id: params.itemId,
    p_counted_qty: Math.max(0, Math.trunc(params.countedQty)),
  });
  if (error) throw mapSupabaseError(error);
}

/** Valide la session : applique les corrections de stock dépôt de façon atomique. */
export async function validateWarehouseInventorySession(sessionId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("warehouse_inventory_session_validate", {
    p_session_id: sessionId,
  });
  if (error) throw mapSupabaseError(error);
}

/** Annule une session ouverte (aucun impact stock). */
export async function cancelWarehouseInventorySession(sessionId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("warehouse_inventory_session_cancel", {
    p_session_id: sessionId,
  });
  if (error) throw mapSupabaseError(error);
}

/**
 * Rouvre une session clôturée ou annulée pour continuer le comptage.
 * Le stock théorique du dépôt est re-snapshoté côté base : les écarts déjà appliqués
 * ne le seront pas une seconde fois à la prochaine validation.
 */
export async function reopenWarehouseInventorySession(sessionId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("warehouse_inventory_session_reopen", {
    p_session_id: sessionId,
  });
  if (error) throw mapSupabaseError(error);
}

/** Supprime définitivement une session annulée. */
export async function deleteWarehouseInventorySession(sessionId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("warehouse_inventory_session_delete", {
    p_session_id: sessionId,
  });
  if (error) throw mapSupabaseError(error);
}
