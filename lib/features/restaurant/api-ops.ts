"use client";

/**
 * Module Restaurant — la livraison, la caisse, le gaspillage.
 *
 * Ce sont les trois endroits où l'argent sort sans qu'une vente le dise : une course
 * qui échoue, un tiroir qui ne tombe pas juste, une marmite jetée.
 */

import { createClient } from "@/lib/supabase/client";
import { mapSupabaseError } from "@/lib/supabase/map-error";
import {
  RESTAURANT_PAGE_SIZE,
  type CashCloseResult,
  type CashMovement,
  type CashMovementType,
  type CashSession,
  type CashSessionState,
  type Courier,
  type CourierVehicle,
  type DeliveryState,
  type DeliveryZone,
  type WasteEntry,
  type WasteReason,
} from "./types";

function num(v: unknown, fallback = 0): number {
  const n = Number(v ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

async function resolveNames(userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", ids);
  if (error) return new Map();
  const m = new Map<string, string>();
  for (const p of data ?? []) {
    const row = p as { id: string; full_name?: string | null };
    const name = (row.full_name ?? "").trim();
    if (name) m.set(String(row.id), name);
  }
  return m;
}

/* ─────────────────────────── Zones de livraison ─────────────────────────── */

export async function listDeliveryZones(params: {
  companyId: string;
  storeId?: string | null;
  includeInactive?: boolean;
}): Promise<DeliveryZone[]> {
  const supabase = createClient();
  let q = supabase
    .from("restaurant_delivery_zones")
    .select("id, store_id, name, fee, eta_minutes, min_order, note, position, is_active")
    .eq("company_id", params.companyId)
    .order("position", { ascending: true })
    .order("name", { ascending: true });
  if (!params.includeInactive) q = q.eq("is_active", true);

  const { data, error } = await q;
  if (error) throw mapSupabaseError(error);

  return (data ?? [])
    .map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: String(row.id),
        storeId: row.store_id ? String(row.store_id) : null,
        name: String(row.name ?? ""),
        fee: num(row.fee),
        etaMinutes: num(row.eta_minutes, 30),
        minOrder: num(row.min_order),
        note: (row.note as string | null) ?? null,
        position: num(row.position),
        isActive: row.is_active !== false,
      };
    })
    /* Zone sans boutique = zone de toute la maison. */
    .filter((z) => !params.storeId || z.storeId === null || z.storeId === params.storeId);
}

export async function upsertDeliveryZone(params: {
  id?: string;
  companyId: string;
  storeId?: string | null;
  name: string;
  fee: number;
  etaMinutes: number;
  minOrder: number;
  note?: string | null;
  isActive?: boolean;
}): Promise<void> {
  const supabase = createClient();
  const payload = {
    company_id: params.companyId,
    store_id: params.storeId ?? null,
    name: params.name.trim(),
    fee: Math.max(0, params.fee),
    eta_minutes: Math.max(1, Math.trunc(params.etaMinutes)),
    min_order: Math.max(0, params.minOrder),
    note: params.note?.trim() || null,
    is_active: params.isActive ?? true,
  };
  const { error } = params.id
    ? await supabase.from("restaurant_delivery_zones").update(payload).eq("id", params.id)
    : await supabase.from("restaurant_delivery_zones").insert(payload);
  if (error) throw mapSupabaseError(error);
}

export async function deleteDeliveryZone(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("restaurant_delivery_zones")
    .delete()
    .eq("id", id);
  if (error) throw mapSupabaseError(error);
}

/* ─────────────────────────── Livreurs ─────────────────────────── */

export async function listCouriers(params: {
  companyId: string;
  storeId?: string | null;
  includeInactive?: boolean;
  /** Compter les courses en cours de chaque livreur (page Suivi). */
  withActiveCount?: boolean;
}): Promise<Courier[]> {
  const supabase = createClient();
  let q = supabase
    .from("restaurant_couriers")
    .select("id, store_id, name, phone, vehicle, plate, user_id, is_active, note")
    .eq("company_id", params.companyId)
    .order("name", { ascending: true });
  if (!params.includeInactive) q = q.eq("is_active", true);

  const { data, error } = await q;
  if (error) throw mapSupabaseError(error);

  const couriers = (data ?? [])
    .map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: String(row.id),
        storeId: row.store_id ? String(row.store_id) : null,
        name: String(row.name ?? ""),
        phone: (row.phone as string | null) ?? null,
        vehicle: (String(row.vehicle ?? "moto") as CourierVehicle) ?? "moto",
        plate: (row.plate as string | null) ?? null,
        userId: row.user_id ? String(row.user_id) : null,
        isActive: row.is_active !== false,
        note: (row.note as string | null) ?? null,
      } satisfies Courier;
    })
    .filter((c) => !params.storeId || c.storeId === null || c.storeId === params.storeId);

  if (!params.withActiveCount || couriers.length === 0) return couriers;

  const { data: busy } = await supabase
    .from("restaurant_orders")
    .select("courier_id")
    .eq("company_id", params.companyId)
    .in("delivery_state", ["assigned", "on_route"])
    .in(
      "courier_id",
      couriers.map((c) => c.id),
    );

  const counts = new Map<string, number>();
  for (const b of (busy ?? []) as Array<{ courier_id: string | null }>) {
    if (!b.courier_id) continue;
    const id = String(b.courier_id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return couriers.map((c) => ({ ...c, activeCount: counts.get(c.id) ?? 0 }));
}

export async function upsertCourier(params: {
  id?: string;
  companyId: string;
  storeId?: string | null;
  name: string;
  phone?: string | null;
  vehicle: CourierVehicle;
  plate?: string | null;
  note?: string | null;
  isActive?: boolean;
}): Promise<void> {
  const supabase = createClient();
  const payload = {
    company_id: params.companyId,
    store_id: params.storeId ?? null,
    name: params.name.trim(),
    phone: params.phone?.trim() || null,
    vehicle: params.vehicle,
    plate: params.plate?.trim() || null,
    note: params.note?.trim() || null,
    is_active: params.isActive ?? true,
  };
  const { error } = params.id
    ? await supabase.from("restaurant_couriers").update(payload).eq("id", params.id)
    : await supabase.from("restaurant_couriers").insert(payload);
  if (error) throw mapSupabaseError(error);
}

export async function deleteCourier(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("restaurant_couriers").delete().eq("id", id);
  if (error) throw mapSupabaseError(error);
}

/** Désigner, faire partir, marquer remis ou échoué — un seul chemin pour tout le trajet. */
export async function setDelivery(params: {
  orderId: string;
  state: DeliveryState;
  courierId?: string | null;
  zoneId?: string | null;
  fee?: number | null;
  reason?: string | null;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("restaurant_set_delivery", {
    p_order_id: params.orderId,
    p_state: params.state,
    p_courier_id: params.courierId ?? null,
    p_zone_id: params.zoneId ?? null,
    p_fee: params.fee ?? null,
    p_reason: params.reason ?? null,
  });
  if (error) throw mapSupabaseError(error);
}

/* ─────────────────────────── Caisse ─────────────────────────── */

export async function getOpenCashSession(storeId: string): Promise<CashSession | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cash_register_sessions")
    .select("id, store_id, opened_by, opened_at, closed_at, opening_amount, closing_amount, status")
    .eq("store_id", storeId)
    .eq("status", "open")
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) return null;

  const row = data as Record<string, unknown>;
  const names = await resolveNames([String(row.opened_by ?? "")]);
  return mapSession(row, names, null);
}

export async function listCashSessions(params: {
  storeIds: string[];
  storeNames?: Map<string, string>;
  limit?: number;
  offset?: number;
}): Promise<{ rows: CashSession[]; hasMore: boolean }> {
  if (params.storeIds.length === 0) return { rows: [], hasMore: false };
  const supabase = createClient();
  const limit = params.limit ?? RESTAURANT_PAGE_SIZE;
  const offset = Math.max(0, params.offset ?? 0);

  const { data, error } = await supabase
    .from("cash_register_sessions")
    .select("id, store_id, opened_by, opened_at, closed_at, opening_amount, closing_amount, status")
    .in("store_id", params.storeIds)
    .order("opened_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit);
  if (error) throw mapSupabaseError(error);

  const all = (data ?? []) as Array<Record<string, unknown>>;
  const hasMore = all.length > limit;
  const rows = all.slice(0, limit);
  const names = await resolveNames(rows.map((r) => String(r.opened_by ?? "")));
  return {
    rows: rows.map((r) => mapSession(r, names, params.storeNames ?? null)),
    hasMore,
  };
}

function mapSession(
  row: Record<string, unknown>,
  names: Map<string, string>,
  storeNames: Map<string, string> | null,
): CashSession {
  const openedBy = String(row.opened_by ?? "");
  const storeId = String(row.store_id);
  return {
    id: String(row.id),
    storeId,
    storeName: storeNames?.get(storeId) ?? null,
    openedBy,
    openedByName: names.get(openedBy) ?? null,
    openedAt: String(row.opened_at),
    closedAt: (row.closed_at as string | null) ?? null,
    openingAmount: num(row.opening_amount),
    closingAmount: row.closing_amount != null ? num(row.closing_amount) : null,
    status: String(row.status ?? "open") === "closed" ? "closed" : "open",
  };
}

export async function openCashSession(params: {
  companyId: string;
  storeId: string;
  openingAmount: number;
}): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("restaurant_open_cash_session", {
    p_company_id: params.companyId,
    p_store_id: params.storeId,
    p_opening_amount: Math.max(0, params.openingAmount),
  });
  if (error) throw mapSupabaseError(error);
  return String(data ?? "");
}

/**
 * L'état du tiroir à tout instant. Même calcul que la clôture, écrit une seule fois
 * côté base pour que les deux ne puissent jamais diverger.
 */
export async function getCashSessionState(sessionId: string): Promise<CashSessionState> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("restaurant_cash_session_state", {
    p_session_id: sessionId,
  });
  if (error) throw mapSupabaseError(error);
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    opening: num(d.opening),
    cashSales: num(d.cash_sales),
    movements: num(d.movements),
    expected: num(d.expected),
  };
}

export async function addCashMovement(params: {
  sessionId: string;
  type: CashMovementType;
  amount: number;
  notes?: string | null;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("restaurant_cash_movement", {
    p_session_id: params.sessionId,
    p_type: params.type,
    p_amount: Math.abs(params.amount),
    p_notes: params.notes ?? null,
  });
  if (error) throw mapSupabaseError(error);
}

export async function listCashMovements(sessionId: string): Promise<CashMovement[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cash_movements")
    .select("id, type, amount, notes, created_at, created_by")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw mapSupabaseError(error);

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const names = await resolveNames(rows.map((r) => String(r.created_by ?? "")));
  return rows.map((r) => ({
    id: String(r.id),
    type: String(r.type ?? ""),
    amount: num(r.amount),
    notes: (r.notes as string | null) ?? null,
    createdAt: String(r.created_at),
    createdByName: names.get(String(r.created_by ?? "")) ?? null,
  }));
}

/**
 * Clôture. Renvoie le détail du calcul ET l'écart — jamais corrigé en silence : une
 * caisse qui tombe juste tous les soirs parce que le logiciel a ajusté la différence
 * ne sert à rien.
 */
export async function closeCashSession(params: {
  sessionId: string;
  countedAmount: number;
  notes?: string | null;
}): Promise<CashCloseResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("restaurant_close_cash_session", {
    p_session_id: params.sessionId,
    p_counted_amount: Math.max(0, params.countedAmount),
    p_notes: params.notes ?? null,
  });
  if (error) throw mapSupabaseError(error);
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    opening: num(d.opening),
    cashSales: num(d.cash_sales),
    movements: num(d.movements),
    expected: num(d.expected),
    counted: num(d.counted),
    variance: num(d.variance),
  };
}

/* ─────────────────────────── Pertes ─────────────────────────── */

export async function listWaste(params: {
  companyId: string;
  storeId: string | null;
  storeNames?: Map<string, string>;
  fromIso?: string | null;
  toIso?: string | null;
  limit?: number;
  offset?: number;
}): Promise<{ rows: WasteEntry[]; hasMore: boolean }> {
  const supabase = createClient();
  const limit = params.limit ?? RESTAURANT_PAGE_SIZE;
  const offset = Math.max(0, params.offset ?? 0);

  let q = supabase
    .from("restaurant_waste")
    .select(
      "id, store_id, product_id, product_name, quantity, unit_cost, reason, note, order_id, stock_deducted, created_at, created_by",
    )
    .eq("company_id", params.companyId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit);
  if (params.storeId) q = q.eq("store_id", params.storeId);
  if (params.fromIso) q = q.gte("created_at", params.fromIso);
  if (params.toIso) q = q.lte("created_at", params.toIso);

  const { data, error } = await q;
  if (error) throw mapSupabaseError(error);

  const all = (data ?? []) as Array<Record<string, unknown>>;
  const hasMore = all.length > limit;
  const rows = all.slice(0, limit);
  const names = await resolveNames(rows.map((r) => String(r.created_by ?? "")));

  return {
    rows: rows.map((r) => {
      const storeId = String(r.store_id);
      return {
        id: String(r.id),
        storeId,
        storeName: params.storeNames?.get(storeId) ?? null,
        productId: String(r.product_id),
        productName: String(r.product_name ?? ""),
        quantity: num(r.quantity),
        unitCost: num(r.unit_cost),
        reason: (String(r.reason ?? "other") as WasteReason) ?? "other",
        note: (r.note as string | null) ?? null,
        orderId: r.order_id ? String(r.order_id) : null,
        stockDeducted: r.stock_deducted === true,
        createdAt: String(r.created_at),
        createdByName: names.get(String(r.created_by ?? "")) ?? null,
      };
    }),
    hasMore,
  };
}

export async function recordWaste(params: {
  companyId: string;
  storeId: string;
  productId: string;
  quantity: number;
  reason: WasteReason;
  note?: string | null;
  orderId?: string | null;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("restaurant_record_waste", {
    p_company_id: params.companyId,
    p_store_id: params.storeId,
    p_product_id: params.productId,
    p_quantity: Math.max(1, Math.trunc(params.quantity)),
    p_reason: params.reason,
    p_note: params.note ?? null,
    p_order_id: params.orderId ?? null,
  });
  if (error) throw mapSupabaseError(error);
}
