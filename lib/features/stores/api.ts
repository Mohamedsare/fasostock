"use client";

import { createClient } from "@/lib/supabase/client";
import type { Store } from "@/lib/features/stores/types";

const STORE_FIELDS =
  "id, company_id, name, code, address, logo_url, phone, email, description, is_active, is_primary, pos_discount_enabled, created_at, " +
  "currency, primary_color, secondary_color, invoice_prefix, footer_text, legal_info, signature_url, stamp_url, payment_terms, tax_label, tax_number, city, country, commercial_name, slogan, activity, mobile_money, invoice_short_title, invoice_signer_title, invoice_signer_name, invoice_template";

function mapStore(row: Record<string, unknown>): Store {
  return {
    id: String(row.id),
    company_id: String(row.company_id),
    name: String(row.name ?? ""),
    code: (row.code as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    logo_url: (row.logo_url as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    is_active: row.is_active === true,
    is_primary: row.is_primary === true,
    pos_discount_enabled: row.pos_discount_enabled === true,
    currency: (row.currency as string | null) ?? null,
    primary_color: (row.primary_color as string | null) ?? null,
    secondary_color: (row.secondary_color as string | null) ?? null,
    invoice_prefix: (row.invoice_prefix as string | null) ?? null,
    footer_text: (row.footer_text as string | null) ?? null,
    legal_info: (row.legal_info as string | null) ?? null,
    signature_url: (row.signature_url as string | null) ?? null,
    stamp_url: (row.stamp_url as string | null) ?? null,
    payment_terms: (row.payment_terms as string | null) ?? null,
    tax_label: (row.tax_label as string | null) ?? null,
    tax_number: (row.tax_number as string | null) ?? null,
    city: (row.city as string | null) ?? null,
    country: (row.country as string | null) ?? null,
    commercial_name: (row.commercial_name as string | null) ?? null,
    slogan: (row.slogan as string | null) ?? null,
    activity: (row.activity as string | null) ?? null,
    mobile_money: (row.mobile_money as string | null) ?? null,
    invoice_short_title: (row.invoice_short_title as string | null) ?? null,
    invoice_signer_title: (row.invoice_signer_title as string | null) ?? null,
    invoice_signer_name: (row.invoice_signer_name as string | null) ?? null,
    invoice_template: (row.invoice_template as string | null) ?? null,
  };
}

export async function listStores(companyId: string): Promise<Store[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("stores")
    .select(STORE_FIELDS)
    .eq("company_id", companyId)
    .order("is_primary", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) =>
    mapStore(r as unknown as Record<string, unknown>),
  );
}

/** Une boutique — même champs que `listStores` (rafraîchir `invoice_template` comme Flutter). */
export async function getStore(storeId: string): Promise<Store | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("stores")
    .select(STORE_FIELDS)
    .eq("id", storeId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapStore(data as unknown as Record<string, unknown>);
}

export async function getStoreQuota(companyId: string): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("companies")
    .select("store_quota")
    .eq("id", companyId)
    .maybeSingle();
  if (error) throw error;
  const q = (data as { store_quota?: number } | null)?.store_quota;
  return typeof q === "number" && q > 0 ? q : 1;
}

async function getCompanyQuotaFlags(companyId: string): Promise<{
  storeQuota: number;
  storeQuotaIncreaseEnabled: boolean;
}> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("companies")
    .select("store_quota, store_quota_increase_enabled")
    .eq("id", companyId)
    .maybeSingle();
  if (error) throw error;
  const row = data as { store_quota?: number; store_quota_increase_enabled?: boolean } | null;
  const q = row?.store_quota;
  const storeQuota = typeof q === "number" && q > 0 ? q : 1;
  const storeQuotaIncreaseEnabled = row?.store_quota_increase_enabled !== false;
  return { storeQuota, storeQuotaIncreaseEnabled };
}

export async function uploadStoreLogo(
  storeId: string,
  file: File,
): Promise<string> {
  const supabase = createClient();
  const ext = file.name.includes(".")
    ? file.name.split(".").pop() || "jpg"
    : "jpg";
  const path = `${storeId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("store-logos").upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("store-logos").getPublicUrl(path);
  return data.publicUrl;
}

export type CreateStoreInput = {
  companyId: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  description?: string | null;
  isPrimary: boolean;
  logoFile?: File | null;
};

export async function createStore(input: CreateStoreInput): Promise<Store> {
  const supabase = createClient();
  const { data: raw, error } = await supabase.rpc("create_store", {
    p_company_id: input.companyId,
    p_name: input.name,
    p_address: input.address ?? null,
    p_phone: input.phone ?? null,
    p_email: input.email ?? null,
    p_description: input.description ?? null,
    p_is_primary: input.isPrimary,
  });
  if (error) throw error;
  if (!raw || typeof raw !== "object") {
    throw new Error("Création de la boutique impossible.");
  }
  let store = mapStore(raw as unknown as Record<string, unknown>);
  if (input.logoFile && input.logoFile.size > 0) {
    const url = await uploadStoreLogo(store.id, input.logoFile);
    const { data: updated, error: uErr } = await supabase
      .from("stores")
      .update({ logo_url: url })
      .eq("id", store.id)
      .select(STORE_FIELDS)
      .single();
    if (uErr) throw uErr;
    store = mapStore(updated as unknown as Record<string, unknown>);
  }
  return store;
}

export async function updateStore(
  id: string,
  patch: Record<string, unknown>,
): Promise<Store> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("stores")
    .update(patch)
    .eq("id", id)
    .select(STORE_FIELDS)
    .single();
  if (error) throw error;
  return mapStore(data as unknown as Record<string, unknown>);
}

export async function fetchStoresPageData(companyId: string): Promise<{
  stores: Store[];
  storeQuota: number;
  storeQuotaIncreaseEnabled: boolean;
}> {
  const [stores, flags] = await Promise.all([
    listStores(companyId),
    getCompanyQuotaFlags(companyId),
  ]);
  return {
    stores,
    storeQuota: flags.storeQuota,
    storeQuotaIncreaseEnabled: flags.storeQuotaIncreaseEnabled,
  };
}
