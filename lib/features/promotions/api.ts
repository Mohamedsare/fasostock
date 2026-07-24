"use client";

import { createClient } from "@/lib/supabase/client";
import type { ActiveStorePromo, Promotion, PromotionInput } from "./types";

type PromotionListRow = {
  id: string;
  name: string;
  discount_percent: number | string;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  note: string | null;
  created_at: string;
  product_ids: string[] | null;
  store_ids: string[] | null;
  product_count: number | string;
  store_count: number | string;
};

export async function listPromotions(companyId: string): Promise<Promotion[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("promotions_list", {
    p_company_id: companyId,
  });
  if (error) throw error;
  return ((data ?? []) as PromotionListRow[]).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    discountPercent: Number(r.discount_percent ?? 0),
    startsAt: r.starts_at ?? null,
    endsAt: r.ends_at ?? null,
    isActive: r.is_active === true,
    note: r.note ?? null,
    createdAt: String(r.created_at),
    productIds: (r.product_ids ?? []).map((x) => String(x)),
    storeIds: (r.store_ids ?? []).map((x) => String(x)),
    productCount: Number(r.product_count ?? 0),
    storeCount: Number(r.store_count ?? 0),
  }));
}

export async function savePromotion(
  companyId: string,
  input: PromotionInput,
): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("promotion_save", {
    p_id: input.id ?? null,
    p_company_id: companyId,
    p_name: input.name,
    p_discount_percent: input.discountPercent,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_is_active: input.isActive,
    p_note: input.note,
    p_product_ids: input.productIds,
    p_store_ids: input.storeIds,
  });
  if (error) throw error;
  return String(data ?? "");
}

export async function setPromotionActive(id: string, active: boolean): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("promotion_set_active", {
    p_id: id,
    p_active: active,
  });
  if (error) throw error;
}

export async function deletePromotion(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("promotion_delete", { p_id: id });
  if (error) throw error;
}

type ActivePromoRow = {
  product_id: string;
  discount_percent: number | string;
  promotion_id: string;
  name: string;
};

/** Promotions actives (fenêtre de dates + is_active) pour une boutique — pour le POS. */
export async function listActiveStorePromotions(
  storeId: string,
): Promise<ActiveStorePromo[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("promotions_active_for_store", {
    p_store_id: storeId,
  });
  if (error) throw error;
  return ((data ?? []) as ActivePromoRow[]).map((r) => ({
    productId: String(r.product_id),
    discountPercent: Number(r.discount_percent ?? 0),
    promotionId: String(r.promotion_id),
    name: String(r.name),
  }));
}
