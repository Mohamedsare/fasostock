"use client";

import { createClient } from "@/lib/supabase/client";
import { fetchByChunks } from "@/lib/supabase/fetch-by-chunks";
import {
  SHIPMENT_REIMBURSEMENTS_MAX,
  SHIPMENTS_PAGE_SIZE,
} from "./types";
import type {
  CreateShipmentInput,
  Shipment,
  ShipmentPage,
  ShipmentReimbursement,
  ShipmentStatus,
  ShippableSale,
} from "./types";

function toNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Tolérance d'arrondi monnaie, alignée sur le reste de l'application. */
export const SHIPMENT_AMOUNT_EPS = 0.005;

const shipmentSelect =
  "id, shipment_number, store_id, sale_id, offtake_id, customer_id, recipient_name, recipient_phone, destination, carrier, carrier_phone, tracking_ref, package_count, package_note, goods_amount, shipping_cost, shipping_paid_by, shipping_reimbursed, status, shipped_at, delivered_at, expected_at, note, created_at, created_by";

/**
 * Les expéditions d'une boutique (ou de toutes).
 *
 * Les relances et les numéros de facture arrivent en requêtes groupées plutôt qu'une
 * par ligne : soixante colis, ce sont soixante allers-retours sur une connexion de
 * marché — un écran qui met dix secondes à s'afficher.
 */
export async function listShipments(params: {
  companyId: string;
  /** `null` = toutes les boutiques de l'utilisateur. */
  storeId: string | null;
  limit?: number;
  offset?: number;
}): Promise<ShipmentPage> {
  const supabase = createClient();
  const limit = params.limit ?? SHIPMENTS_PAGE_SIZE;
  const offset = Math.max(0, params.offset ?? 0);

  /*
   * PAGINATION SERVEUR — une ligne lue en trop dit « il y a une suite », sans le
   * `count: exact` qui ferait compter toute la table à chaque page.
   *
   * Tri sur `(created_at DESC, id DESC)` : plusieurs colis partent souvent dans la même
   * minute pour le même car. Sur `created_at` seul, leur ordre relatif serait
   * indéterminé d'une requête à l'autre — un colis pourrait apparaître sur deux pages
   * pendant qu'un autre n'apparaîtrait sur aucune. Sur un suivi de frais avancés, un
   * colis invisible est de l'argent perdu.
   */
  let q = supabase
    .from("shipments")
    .select(shipmentSelect)
    .eq("company_id", params.companyId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit);
  if (params.storeId) q = q.eq("store_id", params.storeId);

  const { data: rawRows, error } = await q;
  if (error) throw error;

  const all = (rawRows ?? []) as Array<Record<string, unknown>>;
  const hasMore = all.length > limit;
  const rows = all.slice(0, limit);

  const shipments = rows;
  if (shipments.length === 0) return { rows: [], hasMore: false };

  const ids = shipments.map((r) => String(r.id));
  const saleIds = [
    ...new Set(shipments.map((r) => (r.sale_id ? String(r.sale_id) : "")).filter(Boolean)),
  ];
  const authorIds = [
    ...new Set(
      shipments.map((r) => (r.created_by ? String(r.created_by) : "")).filter(Boolean),
    ),
  ];
  const storeIds = [...new Set(shipments.map((r) => String(r.store_id)))];

  const [reminders, saleNumbers, names, storeNames] = await Promise.all([
    fetchByChunks(ids, async (chunk, from, to) => {
      const { data, error: rErr } = await supabase
        .from("shipment_reminders")
        .select("shipment_id, created_at")
        .in("shipment_id", chunk)
        .order("shipment_id", { ascending: true })
        .order("created_at", { ascending: false })
        .range(from, to);
      if (rErr) return [] as Array<Record<string, unknown>>;
      return (data ?? []) as Array<Record<string, unknown>>;
    }),
    fetchSaleNumbers(saleIds),
    fetchAuthorNames(authorIds),
    fetchStoreNames(storeIds),
  ]);

  const reminderStats = new Map<string, { last: string; count: number }>();
  for (const r of reminders) {
    const key = String(r.shipment_id);
    const at = String(r.created_at ?? "");
    const cur = reminderStats.get(key);
    if (!cur) reminderStats.set(key, { last: at, count: 1 });
    else {
      cur.count += 1;
      if (at > cur.last) cur.last = at;
    }
  }

  const mapped = shipments.map((r) => {
    const cost = toNum(r.shipping_cost);
    const done = toNum(r.shipping_reimbursed);
    const id = String(r.id);
    const createdBy = r.created_by ? String(r.created_by) : null;
    const saleId = r.sale_id ? String(r.sale_id) : null;
    const stat = reminderStats.get(id);
    return {
      id,
      shipmentNumber: String(r.shipment_number ?? ""),
      storeId: String(r.store_id),
      storeName: storeNames.get(String(r.store_id)) ?? null,
      saleId,
      saleNumber: saleId ? (saleNumbers.get(saleId) ?? null) : null,
      offtakeId: r.offtake_id ? String(r.offtake_id) : null,
      customerId: r.customer_id ? String(r.customer_id) : null,
      recipientName: String(r.recipient_name ?? ""),
      recipientPhone: r.recipient_phone ? String(r.recipient_phone) : null,
      destination: String(r.destination ?? ""),
      carrier: r.carrier ? String(r.carrier) : null,
      carrierPhone: r.carrier_phone ? String(r.carrier_phone) : null,
      trackingRef: r.tracking_ref ? String(r.tracking_ref) : null,
      packageCount: Math.max(1, Math.floor(toNum(r.package_count))),
      packageNote: r.package_note ? String(r.package_note) : null,
      goodsAmount: toNum(r.goods_amount),
      shippingCost: cost,
      shippingPaidBy: r.shipping_paid_by === "customer" ? "customer" : "company",
      shippingReimbursed: done,
      shippingRemaining: Math.max(0, cost - done),
      status: (String(r.status ?? "preparing") as ShipmentStatus) ?? "preparing",
      shippedAt: r.shipped_at ? String(r.shipped_at) : null,
      deliveredAt: r.delivered_at ? String(r.delivered_at) : null,
      expectedAt: r.expected_at ? String(r.expected_at) : null,
      note: r.note ? String(r.note) : null,
      createdAt: String(r.created_at),
      createdByName: createdBy ? (names.get(createdBy) ?? null) : null,
      lastReminderAt: stat?.last ?? null,
      reminderCount: stat?.count ?? 0,
    } satisfies Shipment;
  });

  return { rows: mapped, hasMore };
}

/** Enregistre l'expédition. Le RPC ne touche jamais au stock — voir la migration 00213. */
export async function createShipment(input: CreateShipmentInput): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_shipment", {
    p_company_id: input.companyId,
    p_store_id: input.storeId,
    p_recipient_name: input.recipientName,
    p_destination: input.destination,
    p_recipient_phone: input.recipientPhone,
    p_customer_id: input.customerId,
    p_sale_id: input.saleId,
    p_offtake_id: input.offtakeId,
    p_carrier: input.carrier,
    p_carrier_phone: input.carrierPhone,
    p_tracking_ref: input.trackingRef,
    p_package_count: input.packageCount,
    p_package_note: input.packageNote,
    p_goods_amount: input.goodsAmount,
    p_shipping_cost: input.shippingCost,
    p_shipping_paid_by: input.shippingPaidBy,
    p_expected_at: input.expectedAt,
    p_note: input.note,
    p_client_request_id: input.clientRequestId,
  });
  if (error) throw error;
  return String(data);
}

/** Fait avancer le colis. L'horodatage est posé EN BASE, jamais par le navigateur. */
export async function setShipmentStatus(
  shipmentId: string,
  status: ShipmentStatus,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_shipment_status", {
    p_shipment_id: shipmentId,
    p_status: status,
  });
  if (error) throw error;
}

/** Encaisse un remboursement de frais. Retourne le reste dû, recalculé en base. */
export async function addShipmentReimbursement(params: {
  shipmentId: string;
  amount: number;
  method: string;
  reference: string | null;
  note: string | null;
}): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("add_shipment_reimbursement", {
    p_shipment_id: params.shipmentId,
    p_amount: params.amount,
    p_method: params.method,
    p_reference: params.reference,
    p_note: params.note,
  });
  if (error) throw error;
  return toNum(data);
}

/** Les remboursements déjà reçus sur une expédition. */
export async function listShipmentReimbursements(
  shipmentId: string,
): Promise<ShipmentReimbursement[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("shipment_reimbursements")
    .select("id, amount, method, reference, note, created_at, created_by")
    .eq("shipment_id", shipmentId)
    .order("created_at", { ascending: false })
    // Borne de principe : un colis n'a jamais deux cents remboursements, mais aucune
    // lecture ne part sans plafond ici — c'est ce qui met le module à l'abri du seuil
    // silencieux des 1000 lignes de PostgREST, aujourd'hui comme dans trois ans.
    .limit(SHIPMENT_REIMBURSEMENTS_MAX);
  if (error) throw error;

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const names = await fetchAuthorNames([
    ...new Set(rows.map((r) => (r.created_by ? String(r.created_by) : "")).filter(Boolean)),
  ]);

  return rows.map((r) => {
    const by = r.created_by ? String(r.created_by) : null;
    return {
      id: String(r.id),
      amount: toNum(r.amount),
      method: String(r.method ?? "cash"),
      reference: r.reference ? String(r.reference) : null,
      note: r.note ? String(r.note) : null,
      createdAt: String(r.created_at),
      createdByName: by ? (names.get(by) ?? null) : null,
    } satisfies ShipmentReimbursement;
  });
}

/**
 * Note qu'une relance de frais est partie.
 *
 * `sent_by` n'est pas un paramètre : la policy (00213) exige `sent_by = auth.uid()`.
 * Ne lève pas — la relance est déjà partie chez le client, un échec d'écriture ne doit
 * pas se présenter comme un échec d'envoi.
 */
export async function logShipmentReminder(params: {
  companyId: string;
  shipmentId: string;
  amountDue: number;
  message: string | null;
}): Promise<void> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) return;
    await supabase.from("shipment_reminders").insert({
      company_id: params.companyId,
      shipment_id: params.shipmentId,
      channel: "whatsapp",
      amount_due: Math.max(0, Math.round(params.amountDue)),
      message: params.message,
      sent_by: user.id,
    });
  } catch {
    /* trace de confort : jamais bloquante */
  }
}

/**
 * Les factures récentes de la boutique, proposées au rattachement.
 *
 * Le geste réel est « je viens de facturer, j'expédie » : retrouver la vente dans une
 * liste évite de retaper le nom, le téléphone et le montant — et surtout d'écrire un
 * nom légèrement différent de celui de la facture, ce qui casse le rapprochement le
 * jour où l'on cherche « qu'est-ce que j'ai envoyé à ce client ».
 */
export async function listShippableSales(params: {
  companyId: string;
  storeId: string;
  limit?: number;
}): Promise<ShippableSale[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sales")
    .select("id, sale_number, total, created_at, customer_id, customer:customers(id, name, phone)")
    .eq("company_id", params.companyId)
    .eq("store_id", params.storeId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 40);
  if (error) throw error;

  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const cRaw = r.customer;
    const c = Array.isArray(cRaw)
      ? (cRaw[0] as { name?: string; phone?: string } | undefined)
      : (cRaw as { name?: string; phone?: string } | null);
    return {
      id: String(r.id),
      saleNumber: String(r.sale_number ?? ""),
      customerId: r.customer_id ? String(r.customer_id) : null,
      customerName: c?.name != null ? String(c.name) : null,
      customerPhone: c?.phone != null ? String(c.phone) : null,
      total: toNum(r.total),
      createdAt: String(r.created_at),
    } satisfies ShippableSale;
  });
}

/** Réglage entreprise « Expéditions » — écrit par le propriétaire. */
export async function setShipmentsEnabled(
  companyId: string,
  enabled: boolean,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("company_set_shipments_enabled", {
    p_company_id: companyId,
    p_enabled: enabled,
  });
  if (error) throw error;
}

async function fetchSaleNumbers(saleIds: string[]): Promise<Map<string, string>> {
  if (saleIds.length === 0) return new Map();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sales")
    .select("id, sale_number")
    .in("id", saleIds);
  if (error) return new Map();
  const m = new Map<string, string>();
  for (const s of data ?? []) {
    const row = s as { id: string; sale_number?: string | null };
    m.set(String(row.id), String(row.sale_number ?? ""));
  }
  return m;
}

async function fetchAuthorNames(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", userIds);
  if (error) return new Map();
  const m = new Map<string, string>();
  for (const p of data ?? []) {
    const row = p as { id: string; full_name?: string | null };
    const name = (row.full_name ?? "").trim();
    if (name) m.set(String(row.id), name);
  }
  return m;
}

async function fetchStoreNames(storeIds: string[]): Promise<Map<string, string>> {
  if (storeIds.length === 0) return new Map();
  const supabase = createClient();
  const { data, error } = await supabase.from("stores").select("id, name").in("id", storeIds);
  if (error) return new Map();
  const m = new Map<string, string>();
  for (const s of data ?? []) {
    const row = s as { id: string; name?: string | null };
    m.set(String(row.id), String(row.name ?? ""));
  }
  return m;
}
