"use client";

import { createClient } from "@/lib/supabase/client";
import { mapSupabaseError } from "@/lib/supabase/map-error";
import type {
  OnlineOrder,
  OnlineOrderItem,
  OnlineOrderStatus,
  OnlineStoreSettings,
  OnlineStoreSettingsDraft,
} from "./types";

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string | null {
  const s = v != null ? String(v).trim() : "";
  return s === "" ? null : s;
}

/** Slug par défaut proposé à partir du nom de la boutique. */
export function slugifyStoreName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
}

/** Réglages de la vitrine d'une boutique. `null` = jamais configurée. */
export async function fetchOnlineStoreSettings(
  storeId: string,
): Promise<OnlineStoreSettings | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("store_online_settings")
    .select("*")
    .eq("store_id", storeId)
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    storeId: String(r.store_id),
    companyId: String(r.company_id),
    slug: String(r.slug ?? ""),
    isPublished: r.is_published === true,
    displayName: str(r.display_name),
    tagline: str(r.tagline),
    description: str(r.description),
    coverUrl: str(r.cover_url),
    logoUrl: str(r.logo_url),
    accentColor: str(r.accent_color),
    whatsappPhone: str(r.whatsapp_phone),
    callPhone: str(r.call_phone),
    address: str(r.address),
    city: str(r.city),
    hoursNote: str(r.hours_note),
    deliveryEnabled: r.delivery_enabled !== false,
    deliveryFee: toNum(r.delivery_fee),
    deliveryNote: str(r.delivery_note),
    pickupEnabled: r.pickup_enabled !== false,
    payOnDeliveryEnabled: r.pay_on_delivery_enabled !== false,
    payMobileMoneyEnabled: r.pay_mobile_money_enabled === true,
    mobileMoneyNumber: str(r.mobile_money_number),
    minOrderAmount: toNum(r.min_order_amount),
    showOutOfStock: r.show_out_of_stock === true,
  };
}

/** Crée / met à jour la vitrine. Renvoie le slug normalisé retenu par le serveur. */
export async function saveOnlineStoreSettings(
  storeId: string,
  draft: OnlineStoreSettingsDraft,
): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("online_store_settings_save", {
    p_store_id: storeId,
    p_slug: draft.slug,
    p_is_published: draft.isPublished,
    p_display_name: draft.displayName,
    p_tagline: draft.tagline,
    p_description: draft.description,
    p_cover_url: draft.coverUrl,
    p_logo_url: draft.logoUrl,
    p_accent_color: draft.accentColor,
    p_whatsapp_phone: draft.whatsappPhone,
    p_call_phone: draft.callPhone,
    p_address: draft.address,
    p_city: draft.city,
    p_hours_note: draft.hoursNote,
    p_delivery_enabled: draft.deliveryEnabled,
    p_delivery_fee: draft.deliveryFee,
    p_delivery_note: draft.deliveryNote,
    p_pickup_enabled: draft.pickupEnabled,
    p_pay_on_delivery_enabled: draft.payOnDeliveryEnabled,
    p_pay_mobile_money_enabled: draft.payMobileMoneyEnabled,
    p_mobile_money_number: draft.mobileMoneyNumber,
    p_min_order_amount: draft.minOrderAmount,
    p_show_out_of_stock: draft.showOutOfStock,
  });
  if (error) throw mapSupabaseError(error);
  return String(data ?? draft.slug);
}

/**
 * Commandes reçues. `storeId` null = toutes les boutiques de l'entreprise
 * (vue « toutes boutiques » de l'en-tête).
 */
export async function listOnlineOrders(params: {
  companyId: string;
  storeId: string | null;
  status?: OnlineOrderStatus | "all";
  limit?: number;
}): Promise<OnlineOrder[]> {
  const supabase = createClient();
  let q = supabase
    .from("online_orders")
    .select(
      "id, company_id, store_id, order_number, public_token, status, customer_name, customer_phone, customer_address, delivery_mode, payment_method, note, source, items_count, subtotal, delivery_fee, total, sale_id, created_at, handled_at, cancel_reason, store:stores(name), items:online_order_items(id, product_id, product_name, quantity, unit_price, total)",
    )
    .eq("company_id", params.companyId)
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 200);
  if (params.storeId) q = q.eq("store_id", params.storeId);
  if (params.status && params.status !== "all") q = q.eq("status", params.status);

  const { data, error } = await q;
  if (error) throw mapSupabaseError(error);

  return ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const storeRaw = r.store;
    const store = Array.isArray(storeRaw)
      ? (storeRaw[0] as Record<string, unknown> | undefined)
      : (storeRaw as Record<string, unknown> | undefined);
    const items: OnlineOrderItem[] = Array.isArray(r.items)
      ? (r.items as Record<string, unknown>[]).map((i) => ({
          id: String(i.id ?? ""),
          productId: i.product_id != null ? String(i.product_id) : null,
          productName: String(i.product_name ?? ""),
          quantity: toNum(i.quantity),
          unitPrice: toNum(i.unit_price),
          total: toNum(i.total),
        }))
      : [];
    items.sort((a, b) => a.productName.localeCompare(b.productName));
    return {
      id: String(r.id ?? ""),
      companyId: String(r.company_id ?? ""),
      storeId: String(r.store_id ?? ""),
      storeName: store?.name != null ? String(store.name) : null,
      orderNumber: String(r.order_number ?? ""),
      publicToken: String(r.public_token ?? ""),
      status: (String(r.status ?? "pending") as OnlineOrderStatus) ?? "pending",
      customerName: String(r.customer_name ?? ""),
      customerPhone: String(r.customer_phone ?? ""),
      customerAddress: str(r.customer_address),
      deliveryMode: r.delivery_mode === "pickup" ? "pickup" : "delivery",
      paymentMethod:
        r.payment_method === "mobile_money"
          ? "mobile_money"
          : r.payment_method === "on_site"
            ? "on_site"
            : "cash_on_delivery",
      note: str(r.note),
      source: String(r.source ?? "catalog"),
      itemsCount: toNum(r.items_count),
      subtotal: toNum(r.subtotal),
      deliveryFee: toNum(r.delivery_fee),
      total: toNum(r.total),
      saleId: r.sale_id != null ? String(r.sale_id) : null,
      createdAt: String(r.created_at ?? ""),
      handledAt: r.handled_at != null ? String(r.handled_at) : null,
      cancelReason: str(r.cancel_reason),
      items,
    };
  });
}

export async function setOnlineOrderStatus(params: {
  orderId: string;
  status: Exclude<OnlineOrderStatus, "completed">;
  reason?: string | null;
}): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("online_order_set_status", {
    p_order_id: params.orderId,
    p_status: params.status,
    p_reason: params.reason ?? null,
  });
  if (error) throw mapSupabaseError(error);
}

/**
 * Encaisse la commande : elle devient une vente FasoStock normale (stock décrémenté,
 * mouvements, rapports). Renvoie l'id de la vente créée.
 */
export async function convertOnlineOrderToSale(params: {
  orderId: string;
  paymentMethod: "cash" | "mobile_money" | "card" | "other";
}): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("online_order_convert_to_sale", {
    p_order_id: params.orderId,
    p_payment_method: params.paymentMethod,
  });
  if (error) throw mapSupabaseError(error);
  return String(data ?? "");
}
