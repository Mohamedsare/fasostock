"use client";

/**
 * Module Restaurant — les commandes, et l'écran de cuisine.
 *
 * Toute écriture passe par un RPC `SECURITY DEFINER` (00219). Aucune policy INSERT
 * ou UPDATE n'existe sur `restaurant_orders` / `restaurant_order_items` : une policy
 * garde une LIGNE, pas une COLONNE, et un UPDATE ouvert aurait laissé un serveur
 * passer sa table en « encaissée » sans qu'un franc soit entré.
 */

import { createClient } from "@/lib/supabase/client";
import { fetchByChunks } from "@/lib/supabase/fetch-by-chunks";
import { mapSupabaseError } from "@/lib/supabase/map-error";
import {
  RESTAURANT_PAGE_SIZE,
  orderItemTotal,
  type ChosenOption,
  type DeliveryState,
  type ItemStatus,
  type OrderStatus,
  type RestaurantOrder,
  type RestaurantOrderItem,
  type RestaurantOrderSummary,
  type ServiceType,
} from "./types";

function num(v: unknown, fallback = 0): number {
  const n = Number(v ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

const ORDER_SELECT =
  "id, order_number, store_id, service_type, status, table_id, table_label, covers, " +
  "customer_id, contact_name, contact_phone, delivery_address, note, server_id, sale_id, " +
  "opened_at, closed_at, cancel_reason, zone_id, courier_id, delivery_fee, delivery_state, " +
  "dispatched_at, delivered_at, delivery_failure_reason";

const ITEM_SELECT =
  "id, order_id, product_id, product_name, quantity, unit_price, options_label, " +
  "options_amount, note, status, sent_at, ready_at, served_at, void_reason, created_at, created_by";

/** Une ligne annulée ne compte ni dans le total, ni dans le nombre d'articles. */
function isBillable(status: ItemStatus): boolean {
  return status !== "void";
}

function mapItem(r: unknown, names: Map<string, string>): RestaurantOrderItem {
  const row = r as Record<string, unknown>;
  const createdBy = String(row.created_by ?? "");
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    productId: String(row.product_id),
    productName: String(row.product_name ?? ""),
    quantity: num(row.quantity, 1),
    unitPrice: num(row.unit_price),
    optionsLabel: (row.options_label as string | null) ?? null,
    optionsAmount: num(row.options_amount),
    note: (row.note as string | null) ?? null,
    status: String(row.status ?? "pending") as ItemStatus,
    sentAt: (row.sent_at as string | null) ?? null,
    readyAt: (row.ready_at as string | null) ?? null,
    servedAt: (row.served_at as string | null) ?? null,
    voidReason: (row.void_reason as string | null) ?? null,
    createdAt: String(row.created_at),
    createdBy,
    createdByName: names.get(createdBy) ?? null,
  };
}

/** Noms d'affichage — une seule requête groupée, jamais une par ligne. */
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

/**
 * Les commandes, avec leurs agrégats.
 *
 * Les lignes arrivent en UNE requête groupée sur tous les identifiants de la page,
 * puis sont réparties en mémoire. Une requête par commande, c'est vingt allers-retours
 * pour un écran de salle qui se rafraîchit toutes les dix secondes — sur une connexion
 * de marché, l'écran ne s'affiche jamais.
 */
export async function listOrders(params: {
  companyId: string;
  storeId: string | null;
  statuses?: OrderStatus[];
  serviceTypes?: ServiceType[];
  /** Bornes ISO facultatives — sans elles, la liste porte sur les commandes ouvertes. */
  fromIso?: string | null;
  toIso?: string | null;
  limit?: number;
  offset?: number;
}): Promise<{ rows: RestaurantOrderSummary[]; hasMore: boolean }> {
  const supabase = createClient();
  const limit = params.limit ?? RESTAURANT_PAGE_SIZE;
  const offset = Math.max(0, params.offset ?? 0);

  let q = supabase
    .from("restaurant_orders")
    .select(ORDER_SELECT)
    .eq("company_id", params.companyId)
    .order("opened_at", { ascending: false })
    .order("id", { ascending: false })
    // Une ligne de plus que demandé : dit « il y a une suite » sans compter la table.
    .range(offset, offset + limit);

  if (params.storeId) q = q.eq("store_id", params.storeId);
  if (params.statuses?.length) q = q.in("status", params.statuses);
  if (params.serviceTypes?.length) q = q.in("service_type", params.serviceTypes);
  if (params.fromIso) q = q.gte("opened_at", params.fromIso);
  if (params.toIso) q = q.lte("opened_at", params.toIso);

  const { data, error } = await q;
  if (error) throw mapSupabaseError(error);

  const all = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const hasMore = all.length > limit;
  const rows = all.slice(0, limit);
  if (rows.length === 0) return { rows: [], hasMore: false };

  const orderIds = rows.map((r) => String(r.id));
  const serverIds = rows.map((r) => (r.server_id ? String(r.server_id) : "")).filter(Boolean);
  const customerIds = [
    ...new Set(rows.map((r) => (r.customer_id ? String(r.customer_id) : "")).filter(Boolean)),
  ];
  const courierIds = [
    ...new Set(rows.map((r) => (r.courier_id ? String(r.courier_id) : "")).filter(Boolean)),
  ];
  const zoneIds = [
    ...new Set(rows.map((r) => (r.zone_id ? String(r.zone_id) : "")).filter(Boolean)),
  ];

  const [items, names, customers, couriers, zones] = await Promise.all([
    fetchByChunks<Record<string, unknown>>(orderIds, async (chunk, from, to) => {
      const { data: d, error: e } = await supabase
        .from("restaurant_order_items")
        .select("id, order_id, quantity, unit_price, options_amount, status")
        .in("order_id", chunk)
        .order("id", { ascending: true })
        .range(from, to);
      if (e) throw mapSupabaseError(e);
      return (d ?? []) as unknown as Array<Record<string, unknown>>;
    }),
    resolveNames(serverIds),
    fetchLabels("customers", customerIds, "name"),
    fetchLabels("restaurant_couriers", courierIds, "name"),
    fetchLabels("restaurant_delivery_zones", zoneIds, "name"),
  ]);

  type Agg = { count: number; total: number; pending: number; ready: boolean };
  const byOrder = new Map<string, Agg>();
  for (const it of items) {
    const oid = String(it.order_id);
    const status = String(it.status ?? "pending") as ItemStatus;
    const agg = byOrder.get(oid) ?? { count: 0, total: 0, pending: 0, ready: false };
    if (isBillable(status)) {
      agg.count += num(it.quantity, 1);
      agg.total += orderItemTotal({
        quantity: num(it.quantity, 1),
        unitPrice: num(it.unit_price),
        optionsAmount: num(it.options_amount),
      });
      if (status !== "served") agg.pending += 1;
      if (status === "ready") agg.ready = true;
    }
    byOrder.set(oid, agg);
  }

  return {
    rows: rows.map((r) => {
      const agg = byOrder.get(String(r.id)) ?? { count: 0, total: 0, pending: 0, ready: false };
      return mapOrder(r, {
        names,
        customers,
        couriers,
        zones,
        itemCount: agg.count,
        total: agg.total,
        pendingKitchenCount: agg.pending,
        hasReadyItems: agg.ready,
      });
    }),
    hasMore,
  };
}

async function fetchLabels(
  table: string,
  ids: string[],
  column: string,
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const supabase = createClient();
  const { data, error } = await supabase.from(table).select(`id, ${column}`).in("id", ids);
  if (error) return new Map();
  const m = new Map<string, string>();
  for (const r of (data ?? []) as unknown[]) {
    const row = r as Record<string, unknown>;
    const v = String(row[column] ?? "").trim();
    if (v) m.set(String(row.id), v);
  }
  return m;
}

function mapOrder(
  r: Record<string, unknown>,
  ctx: {
    names: Map<string, string>;
    customers: Map<string, string>;
    couriers: Map<string, string>;
    zones: Map<string, string>;
    itemCount: number;
    total: number;
    pendingKitchenCount: number;
    hasReadyItems: boolean;
  },
): RestaurantOrderSummary {
  const serverId = r.server_id ? String(r.server_id) : null;
  const customerId = r.customer_id ? String(r.customer_id) : null;
  const courierId = r.courier_id ? String(r.courier_id) : null;
  const zoneId = r.zone_id ? String(r.zone_id) : null;
  return {
    id: String(r.id),
    orderNumber: String(r.order_number ?? ""),
    storeId: String(r.store_id),
    serviceType: String(r.service_type ?? "dine_in") as ServiceType,
    status: String(r.status ?? "open") as OrderStatus,
    tableId: r.table_id ? String(r.table_id) : null,
    tableLabel: (r.table_label as string | null) ?? null,
    covers: num(r.covers, 1),
    customerId,
    customerName: customerId ? (ctx.customers.get(customerId) ?? null) : null,
    contactName: (r.contact_name as string | null) ?? null,
    contactPhone: (r.contact_phone as string | null) ?? null,
    deliveryAddress: (r.delivery_address as string | null) ?? null,
    note: (r.note as string | null) ?? null,
    serverId,
    serverName: serverId ? (ctx.names.get(serverId) ?? null) : null,
    saleId: r.sale_id ? String(r.sale_id) : null,
    openedAt: String(r.opened_at),
    closedAt: (r.closed_at as string | null) ?? null,
    cancelReason: (r.cancel_reason as string | null) ?? null,
    zoneId,
    zoneName: zoneId ? (ctx.zones.get(zoneId) ?? null) : null,
    courierId,
    courierName: courierId ? (ctx.couriers.get(courierId) ?? null) : null,
    deliveryFee: num(r.delivery_fee),
    deliveryState: (r.delivery_state as DeliveryState | null) ?? null,
    dispatchedAt: (r.dispatched_at as string | null) ?? null,
    deliveredAt: (r.delivered_at as string | null) ?? null,
    deliveryFailureReason: (r.delivery_failure_reason as string | null) ?? null,
    itemCount: ctx.itemCount,
    total: ctx.total,
    pendingKitchenCount: ctx.pendingKitchenCount,
    hasReadyItems: ctx.hasReadyItems,
  };
}

/** Une commande avec le détail de ses lignes — l'écran du serveur. */
export async function getOrder(orderId: string): Promise<RestaurantOrder | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("restaurant_orders")
    .select(ORDER_SELECT)
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) return null;

  const row = data as unknown as Record<string, unknown>;

  const { data: itemRows, error: iErr } = await supabase
    .from("restaurant_order_items")
    .select(ITEM_SELECT)
    .eq("order_id", orderId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (iErr) throw mapSupabaseError(iErr);

  const raw = (itemRows ?? []) as unknown as Array<Record<string, unknown>>;
  const authorIds = raw.map((r) => String(r.created_by ?? ""));
  const serverId = row.server_id ? String(row.server_id) : "";
  const names = await resolveNames([...authorIds, serverId]);

  const customerId = row.customer_id ? String(row.customer_id) : null;
  const courierId = row.courier_id ? String(row.courier_id) : null;
  const zoneId = row.zone_id ? String(row.zone_id) : null;
  const [customers, couriers, zones] = await Promise.all([
    fetchLabels("customers", customerId ? [customerId] : [], "name"),
    fetchLabels("restaurant_couriers", courierId ? [courierId] : [], "name"),
    fetchLabels("restaurant_delivery_zones", zoneId ? [zoneId] : [], "name"),
  ]);

  const items = raw.map((r) => mapItem(r, names));
  const billable = items.filter((i) => isBillable(i.status));

  return {
    ...mapOrder(row, {
      names,
      customers,
      couriers,
      zones,
      itemCount: billable.reduce((s, i) => s + i.quantity, 0),
      total: billable.reduce((s, i) => s + orderItemTotal(i), 0),
      pendingKitchenCount: billable.filter((i) => i.status !== "served").length,
      hasReadyItems: billable.some((i) => i.status === "ready"),
    }),
    items,
  };
}

/** La commande en cours sur une table, s'il y en a une. */
export async function getOpenOrderForTable(tableId: string): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("restaurant_orders")
    .select("id")
    .eq("table_id", tableId)
    .eq("status", "open")
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  return data ? String((data as { id: string }).id) : null;
}

/* ─────────────────────────── Écritures (RPC) ─────────────────────────── */

export async function openOrder(params: {
  companyId: string;
  storeId: string;
  serviceType: ServiceType;
  tableId?: string | null;
  covers?: number;
  customerId?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  deliveryAddress?: string | null;
  note?: string | null;
  serverId?: string | null;
}): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("restaurant_open_order", {
    p_company_id: params.companyId,
    p_store_id: params.storeId,
    p_service_type: params.serviceType,
    p_table_id: params.tableId ?? null,
    p_covers: params.covers ?? 1,
    p_customer_id: params.customerId ?? null,
    p_contact_name: params.contactName ?? null,
    p_contact_phone: params.contactPhone ?? null,
    p_delivery_address: params.deliveryAddress ?? null,
    p_note: params.note ?? null,
    p_server_id: params.serverId ?? null,
  });
  if (error) throw mapSupabaseError(error);
  const id = String(data ?? "");
  if (!id) throw new Error("Commande non créée.");
  return id;
}

export async function addOrderItems(params: {
  orderId: string;
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    note?: string | null;
    options?: ChosenOption[];
  }>;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("restaurant_add_order_items", {
    p_order_id: params.orderId,
    p_items: params.items.map((i) => ({
      product_id: i.productId,
      quantity: Math.max(1, Math.trunc(i.quantity)),
      unit_price: i.unitPrice,
      note: i.note ?? null,
      options_label: summariseOptions(i.options),
      options_amount: (i.options ?? []).reduce((s, o) => s + o.priceDelta, 0),
    })),
  });
  if (error) throw mapSupabaseError(error);
}

/**
 * Le résumé imprimé sur le bon et lu en caisse. Écrit ici ET recalculé par
 * `restaurant_set_item_options` côté base : les deux doivent produire la même chaîne,
 * d'où le séparateur partagé.
 */
export const OPTION_SEPARATOR = " · ";

function summariseOptions(options?: ChosenOption[]): string | null {
  if (!options?.length) return null;
  return options.map((o) => o.label).join(OPTION_SEPARATOR) || null;
}

export async function updateOrderItem(params: {
  itemId: string;
  quantity?: number;
  note?: string | null;
  remove?: boolean;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("restaurant_update_order_item", {
    p_item_id: params.itemId,
    p_quantity: params.quantity ?? null,
    p_note: params.note ?? null,
    p_delete: params.remove ?? false,
  });
  if (error) throw mapSupabaseError(error);
}

/**
 * `directServeIds` : les lignes qui ne passent pas par la cuisine (bières, sucreries).
 * La liste vient de l'application, qui connaît la station de production de chaque
 * article — la base ne devine pas ce qui se cuisine.
 */
export async function sendToKitchen(params: {
  orderId: string;
  directServeIds?: string[];
}): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("restaurant_send_to_kitchen", {
    p_order_id: params.orderId,
    p_direct_serve_ids: params.directServeIds?.length ? params.directServeIds : null,
  });
  if (error) throw mapSupabaseError(error);
  return num(data);
}

export async function advanceItem(itemId: string, status: ItemStatus): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("restaurant_advance_item", {
    p_item_id: itemId,
    p_status: status,
  });
  if (error) throw mapSupabaseError(error);
}

export async function voidOrderItem(itemId: string, reason: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("restaurant_void_order_item", {
    p_item_id: itemId,
    p_reason: reason,
  });
  if (error) throw mapSupabaseError(error);
}

export async function moveOrder(orderId: string, tableId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("restaurant_move_order", {
    p_order_id: orderId,
    p_table_id: tableId,
  });
  if (error) throw mapSupabaseError(error);
}

export async function updateOrder(params: {
  orderId: string;
  covers?: number;
  note?: string | null;
  customerId?: string | null;
  clearCustomer?: boolean;
  contactName?: string | null;
  contactPhone?: string | null;
  deliveryAddress?: string | null;
  serverId?: string | null;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("restaurant_update_order", {
    p_order_id: params.orderId,
    p_covers: params.covers ?? null,
    p_note: params.note ?? null,
    p_customer_id: params.customerId ?? null,
    p_contact_name: params.contactName ?? null,
    p_contact_phone: params.contactPhone ?? null,
    p_delivery_address: params.deliveryAddress ?? null,
    p_server_id: params.serverId ?? null,
    p_clear_customer: params.clearCustomer ?? false,
  });
  if (error) throw mapSupabaseError(error);
}

export async function cancelOrder(orderId: string, reason: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("restaurant_cancel_order", {
    p_order_id: orderId,
    p_reason: reason,
  });
  if (error) throw mapSupabaseError(error);
}

/**
 * Rattache la commande à la vente qui vient de l'encaisser. Appelée APRÈS
 * `create_sale_with_stock` — c'est le seul chemin vers `paid`.
 */
export async function settleOrder(orderId: string, saleId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("restaurant_settle_order", {
    p_order_id: orderId,
    p_sale_id: saleId,
  });
  if (error) throw mapSupabaseError(error);
}

/* ─────────────────────────── Écran de cuisine ─────────────────────────── */

/** Un bon vu par la cuisine : ce qu'il faut préparer, pour quelle table, depuis quand. */
export type KitchenTicket = {
  orderId: string;
  orderNumber: string;
  serviceType: ServiceType;
  tableLabel: string | null;
  serverName: string | null;
  note: string | null;
  /** Envoi le plus ancien du bon — c'est lui qui décide de la place dans la file. */
  sentAt: string | null;
  items: RestaurantOrderItem[];
};

/**
 * Tout ce qui est parti en cuisine et n'est pas encore servi, groupé par commande.
 *
 * Volontairement SANS pagination : un service qui aurait plus de 200 bons ouverts en
 * même temps n'existe pas, et un écran de cuisine paginé serait inutilisable — le
 * cuisinier ne tourne pas des pages avec les mains dans la sauce.
 */
export async function listKitchenTickets(params: {
  companyId: string;
  storeId: string | null;
  /** Ne montrer que les articles de ces stations (colonnes du KDS). */
  stationIds?: string[] | null;
}): Promise<KitchenTicket[]> {
  const supabase = createClient();

  const { data: itemRows, error } = await supabase
    .from("restaurant_order_items")
    .select(ITEM_SELECT)
    .eq("company_id", params.companyId)
    .in("status", ["sent", "preparing", "ready"])
    .order("sent_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(500);
  if (error) throw mapSupabaseError(error);

  const raw = (itemRows ?? []) as unknown as Array<Record<string, unknown>>;
  if (raw.length === 0) return [];

  const orderIds = [...new Set(raw.map((r) => String(r.order_id)))];

  const { data: orderRows, error: oErr } = await supabase
    .from("restaurant_orders")
    .select("id, order_number, store_id, service_type, table_label, server_id, note, status")
    .in("id", orderIds);
  if (oErr) throw mapSupabaseError(oErr);

  const orders = new Map<string, Record<string, unknown>>();
  for (const o of (orderRows ?? []) as Array<Record<string, unknown>>) {
    // Une commande encaissée ou annulée ne doit plus occuper la cuisine.
    if (String(o.status) !== "open") continue;
    if (params.storeId && String(o.store_id) !== params.storeId) continue;
    orders.set(String(o.id), o);
  }
  if (orders.size === 0) return [];

  // Filtrage par station : la fiche carte porte la station, pas la ligne de commande.
  let allowedProducts: Set<string> | null = null;
  if (params.stationIds?.length) {
    const { data: menuRows } = await supabase
      .from("restaurant_menu_items")
      .select("product_id, station_id")
      .eq("company_id", params.companyId)
      .in("station_id", params.stationIds);
    allowedProducts = new Set(
      ((menuRows ?? []) as Array<{ product_id: string }>).map((m) => String(m.product_id)),
    );
  }

  const names = await resolveNames([
    ...raw.map((r) => String(r.created_by ?? "")),
    ...[...orders.values()].map((o) => String(o.server_id ?? "")),
  ]);

  const byOrder = new Map<string, KitchenTicket>();
  for (const r of raw) {
    const oid = String(r.order_id);
    const order = orders.get(oid);
    if (!order) continue;
    if (allowedProducts && !allowedProducts.has(String(r.product_id))) continue;

    let ticket = byOrder.get(oid);
    if (!ticket) {
      const serverId = order.server_id ? String(order.server_id) : "";
      ticket = {
        orderId: oid,
        orderNumber: String(order.order_number ?? ""),
        serviceType: String(order.service_type ?? "dine_in") as ServiceType,
        tableLabel: (order.table_label as string | null) ?? null,
        serverName: names.get(serverId) ?? null,
        note: (order.note as string | null) ?? null,
        sentAt: (r.sent_at as string | null) ?? null,
        items: [],
      };
      byOrder.set(oid, ticket);
    }
    ticket.items.push(mapItem(r, names));
  }

  // Le plus ancien en tête : c'est la seule file d'attente juste en cuisine.
  return [...byOrder.values()].sort((a, b) => {
    const ta = a.sentAt ? Date.parse(a.sentAt) : 0;
    const tb = b.sentAt ? Date.parse(b.sentAt) : 0;
    return ta - tb;
  });
}
