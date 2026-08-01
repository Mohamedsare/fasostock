import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  OnlineDeliveryMode,
  OnlineOrderStatus,
  OnlinePaymentMethod,
  PublicCatalogProduct,
  PublicOnlineStore,
  PublicOrderTracking,
} from "./types";

/**
 * Lectures publiques du catalogue. Aucune table n'est exposée : tout passe par des
 * RPC `SECURITY DEFINER` qui ne renvoient que ce qu'un client a le droit de voir
 * (jamais de prix d'achat, jamais de marge, jamais de données d'une autre boutique).
 * Les fonctions prennent le client Supabase en paramètre pour servir aussi bien le
 * rendu serveur (page publique) que le navigateur (rafraîchissement du stock).
 */

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string | null {
  const s = v != null ? String(v).trim() : "";
  return s === "" ? null : s;
}

export async function fetchPublicOnlineStore(
  supabase: SupabaseClient,
  slug: string,
): Promise<PublicOnlineStore | null> {
  const { data, error } = await supabase.rpc("public_online_store", { p_slug: slug });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    storeId: String(row.store_id ?? ""),
    companyId: String(row.company_id ?? ""),
    slug: String(row.slug ?? slug),
    displayName: String(row.display_name ?? ""),
    tagline: str(row.tagline),
    description: str(row.description),
    coverUrl: str(row.cover_url),
    logoUrl: str(row.logo_url),
    accentColor: str(row.accent_color) ?? "#F97316",
    whatsappPhone: str(row.whatsapp_phone),
    callPhone: str(row.call_phone),
    address: str(row.address),
    city: str(row.city),
    hoursNote: str(row.hours_note),
    deliveryEnabled: row.delivery_enabled !== false,
    deliveryFee: toNum(row.delivery_fee),
    deliveryNote: str(row.delivery_note),
    pickupEnabled: row.pickup_enabled !== false,
    payOnDeliveryEnabled: row.pay_on_delivery_enabled !== false,
    payMobileMoneyEnabled: row.pay_mobile_money_enabled === true,
    mobileMoneyNumber: str(row.mobile_money_number),
    minOrderAmount: toNum(row.min_order_amount),
    showOutOfStock: row.show_out_of_stock === true,
    productsCount: toNum(row.products_count),
  };
}

export async function fetchPublicCatalog(
  supabase: SupabaseClient,
  slug: string,
  limit = 400,
  offset = 0,
): Promise<PublicCatalogProduct[]> {
  const { data, error } = await supabase.rpc("public_online_catalog", {
    p_slug: slug,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    productId: String(r.product_id ?? ""),
    name: String(r.name ?? ""),
    description: str(r.description),
    unit: String(r.unit ?? "pce"),
    categoryId: r.category_id != null ? String(r.category_id) : null,
    categoryName: str(r.category_name),
    brandName: str(r.brand_name),
    price: toNum(r.price),
    basePrice: toNum(r.base_price),
    discountPercent: toNum(r.discount_percent),
    stock: toNum(r.stock),
    imageUrl: str(r.image_url),
  }));
}

export async function createPublicOnlineOrder(
  supabase: SupabaseClient,
  params: {
    slug: string;
    customerName: string;
    customerPhone: string;
    deliveryMode: OnlineDeliveryMode;
    paymentMethod: OnlinePaymentMethod;
    customerAddress: string | null;
    note: string | null;
    items: Array<{ productId: string; quantity: number }>;
    source?: string;
  },
): Promise<{ orderNumber: string; publicToken: string; total: number }> {
  const { data, error } = await supabase.rpc("public_online_order_create", {
    p_slug: params.slug,
    p_customer_name: params.customerName,
    p_customer_phone: params.customerPhone,
    p_delivery_mode: params.deliveryMode,
    p_payment_method: params.paymentMethod,
    p_customer_address: params.customerAddress,
    p_note: params.note,
    p_items: params.items.map((i) => ({
      product_id: i.productId,
      quantity: Math.max(1, Math.trunc(i.quantity)),
    })),
    p_source: params.source ?? "catalog",
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!row) throw new Error("Commande non enregistrée. Réessayez.");
  return {
    orderNumber: String(row.order_number ?? ""),
    publicToken: String(row.public_token ?? ""),
    total: toNum(row.total),
  };
}

export async function fetchPublicOrderTracking(
  supabase: SupabaseClient,
  token: string,
): Promise<PublicOrderTracking | null> {
  const { data, error } = await supabase.rpc("public_online_order_track", {
    p_token: token,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!row) return null;
  const rawItems = Array.isArray(row.items) ? (row.items as Record<string, unknown>[]) : [];
  return {
    orderNumber: String(row.order_number ?? ""),
    status: (String(row.status ?? "pending") as OnlineOrderStatus) ?? "pending",
    createdAt: String(row.created_at ?? ""),
    customerName: String(row.customer_name ?? ""),
    deliveryMode: row.delivery_mode === "pickup" ? "pickup" : "delivery",
    paymentMethod:
      row.payment_method === "mobile_money"
        ? "mobile_money"
        : row.payment_method === "on_site"
          ? "on_site"
          : "cash_on_delivery",
    customerAddress: str(row.customer_address),
    subtotal: toNum(row.subtotal),
    deliveryFee: toNum(row.delivery_fee),
    total: toNum(row.total),
    shopName: String(row.shop_name ?? "Boutique"),
    shopSlug: str(row.shop_slug),
    shopPhone: str(row.shop_phone),
    items: rawItems.map((i) => ({
      name: String(i.name ?? ""),
      quantity: toNum(i.quantity),
      unitPrice: toNum(i.unit_price),
      total: toNum(i.total),
    })),
  };
}
