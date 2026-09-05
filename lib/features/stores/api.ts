"use client";

import { isUndefinedColumnError } from "@/lib/features/common/optimistic-column";
import { createClient } from "@/lib/supabase/client";
import { compressImageForUpload } from "@/lib/utils/image-compress";
import { safeImageExtension } from "@/lib/utils/image-file";
import type { Store } from "@/lib/features/stores/types";

const STORE_FIELDS_BASE =
  "id, company_id, name, code, address, logo_url, phone, email, description, is_active, is_primary, pos_discount_enabled, created_at, " +
  "currency, primary_color, secondary_color, invoice_prefix, footer_text, legal_info, signature_url, stamp_url, payment_terms, tax_label, tax_number, city, country, commercial_name, slogan, activity, mobile_money, invoice_short_title, invoice_signer_title, invoice_signer_name, invoice_template, engine_invoice_signatory, engine_invoice_extra_phones, receipt_paper_width_mm, receipt_template, shares_company_catalog";

/*
 * `invoice_layout` (migration 00218) porte la mise en page des documents choisie par
 * le propriétaire. Tant que la migration n'est pas appliquée, la colonne n'existe pas :
 * la demander ferait échouer TOUTE la lecture des boutiques — donc la caisse, les
 * ventes et le tableau de bord. On l'interroge de façon optimiste et on rebascule
 * définitivement sur l'ancien SELECT à la première erreur « colonne inconnue », comme
 * le fait déjà le catalogue produits.
 */
let invoiceLayoutColumnAvailable = true;

function storeFields(): string {
  return invoiceLayoutColumnAvailable
    ? `${STORE_FIELDS_BASE}, invoice_layout`
    : STORE_FIELDS_BASE;
}

/** Rejoue une lecture sans `invoice_layout` quand la colonne manque encore. */
async function selectStores<T>(
  run: (fields: string) => PromiseLike<{ data: T; error: unknown }>,
): Promise<{ data: T; error: unknown }> {
  const first = await run(storeFields());
  if (first.error && invoiceLayoutColumnAvailable && isUndefinedColumnError(first.error, "invoice_layout")) {
    invoiceLayoutColumnAvailable = false;
    return await run(storeFields());
  }
  return first;
}

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
    engine_invoice_signatory: (row.engine_invoice_signatory as string | null) ?? null,
    engine_invoice_extra_phones: (row.engine_invoice_extra_phones as string | null) ?? null,
    receipt_paper_width_mm:
      row.receipt_paper_width_mm === 58 || row.receipt_paper_width_mm === 80
        ? (row.receipt_paper_width_mm as number)
        : null,
    receipt_template: (row.receipt_template as string | null) ?? null,
    // Défaut historique : partage du catalogue si la colonne est absente/null.
    shares_company_catalog: row.shares_company_catalog !== false,
    invoice_layout: row.invoice_layout ?? null,
  };
}

export async function listStores(companyId: string): Promise<Store[]> {
  const supabase = createClient();
  const { data, error } = await selectStores((fields) =>
    supabase
      .from("stores")
      .select(fields)
      .eq("company_id", companyId)
      .order("is_primary", { ascending: false })
      .order("name", { ascending: true }),
  );
  if (error) throw error;
  return (data ?? []).map((r) =>
    mapStore(r as unknown as Record<string, unknown>),
  );
}

/** Une boutique — même champs que `listStores` (rafraîchir `invoice_template` comme Flutter). */
export async function getStore(storeId: string): Promise<Store | null> {
  const supabase = createClient();
  const { data, error } = await selectStores((fields) =>
    supabase.from("stores").select(fields).eq("id", storeId).maybeSingle(),
  );
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
  const optimized = await compressImageForUpload(file, "logo");
  const ext = safeImageExtension(optimized.name);
  const path = `${storeId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("store-logos").upload(path, optimized, {
    contentType: optimized.type || "image/jpeg",
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
  /** true = la boutique partage tout le catalogue de l'entreprise (défaut). false = catalogue personnalisé. */
  sharesCompanyCatalog?: boolean;
  /** Si catalogue personnalisé, copier les produits d'une boutique existante. */
  copyCatalogFromStoreId?: string | null;
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
    p_shares_company_catalog: input.sharesCompanyCatalog ?? true,
    p_copy_from_store_id: input.copyCatalogFromStoreId ?? null,
  });
  if (error) throw error;
  if (!raw || typeof raw !== "object") {
    throw new Error("Création de la boutique impossible.");
  }
  let store = mapStore(raw as unknown as Record<string, unknown>);
  if (input.logoFile && input.logoFile.size > 0) {
    const url = await uploadStoreLogo(store.id, input.logoFile);
    const { data: updated, error: uErr } = await selectStores((fields) =>
      supabase
        .from("stores")
        .update({ logo_url: url })
        .eq("id", store.id)
        .select(fields)
        .single(),
    );
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
  const { data, error } = await selectStores((fields) =>
    supabase.from("stores").update(patch).eq("id", id).select(fields).single(),
  );
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
