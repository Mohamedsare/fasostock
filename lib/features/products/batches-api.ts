"use client";

import { createClient } from "@/lib/supabase/client";

/** Un lot de médicament (table `product_batches`). */
export type ProductBatch = {
  id: string;
  company_id: string;
  product_id: string;
  store_id: string | null;
  lot_number: string | null;
  expiry_date: string | null;
  quantity: number;
  notes: string | null;
};

export type ProductBatchInput = {
  lotNumber: string;
  expiryDate: string;
  quantity: number;
  storeId: string | null;
  notes: string;
};

const batchSelect =
  "id, company_id, product_id, store_id, lot_number, expiry_date, quantity, notes";

export async function listProductBatches(
  productId: string,
): Promise<ProductBatch[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("product_batches")
    .select(batchSelect)
    .eq("product_id", productId)
    .order("expiry_date", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return ((data ?? []) as ProductBatch[]).map((b) => ({
    ...b,
    quantity: Math.max(0, Math.floor(Number(b.quantity ?? 0))),
  }));
}

export async function createProductBatch(
  companyId: string,
  productId: string,
  input: ProductBatchInput,
): Promise<void> {
  const supabase = createClient();
  const payload = {
    company_id: companyId,
    product_id: productId,
    store_id: input.storeId || null,
    lot_number: input.lotNumber.trim() || null,
    expiry_date: input.expiryDate || null,
    quantity: Math.max(0, Math.round(input.quantity)),
    notes: input.notes.trim() || null,
  };
  const { error } = await supabase.from("product_batches").insert(payload);
  if (error) throw error;
}

export async function updateProductBatch(
  id: string,
  input: ProductBatchInput,
): Promise<void> {
  const supabase = createClient();
  const patch = {
    store_id: input.storeId || null,
    lot_number: input.lotNumber.trim() || null,
    expiry_date: input.expiryDate || null,
    quantity: Math.max(0, Math.round(input.quantity)),
    notes: input.notes.trim() || null,
  };
  const { error } = await supabase
    .from("product_batches")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteProductBatch(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("product_batches").delete().eq("id", id);
  if (error) throw error;
}

/** Synthèse péremption d'une entreprise (tableau de bord pharmacie). */
export type ExpirySummary = {
  expiredCount: number;
  expiringSoonCount: number;
  expiredQuantity: number;
  expiringSoonQuantity: number;
  /** Lots les plus urgents (périmés + bientôt), triés par date. */
  items: Array<{
    productId: string;
    productName: string;
    lotNumber: string | null;
    expiryDate: string;
    quantity: number;
    daysLeft: number;
  }>;
};

/** Fenêtre « bientôt périmé » par défaut (jours). */
export const EXPIRY_SOON_DAYS = 90;

/** Une ligne de la page Péremptions (lot daté avec stock restant). */
export type ExpiryListItem = {
  batchId: string;
  productId: string;
  productName: string;
  storeId: string | null;
  lotNumber: string | null;
  expiryDate: string;
  quantity: number;
  /** Jours restants (négatif = déjà périmé). */
  daysLeft: number;
};

/**
 * Liste complète des lots datés encore en stock (quantité > 0), triés par date
 * de péremption croissante. Sert la page dédiée « Péremptions » (recherche +
 * filtres côté client). Réutilise `product_batches` (aucune table spécifique).
 */
export async function fetchExpiryList(
  companyId: string,
): Promise<ExpiryListItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("product_batches")
    .select(
      "id, product_id, store_id, lot_number, expiry_date, quantity, product:products(name)",
    )
    .eq("company_id", companyId)
    .gt("quantity", 0)
    .not("expiry_date", "is", null)
    .order("expiry_date", { ascending: true });
  if (error) throw error;

  const todayIso = new Date().toISOString().slice(0, 10);
  const todayMs = new Date(todayIso).getTime();

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const expiry = String(row.expiry_date);
    const productRaw = row.product;
    const productName = Array.isArray(productRaw)
      ? String((productRaw[0] as { name?: string } | undefined)?.name ?? "—")
      : String((productRaw as { name?: string } | null)?.name ?? "—");
    const daysLeft = Math.round(
      (new Date(expiry).getTime() - todayMs) / 86_400_000,
    );
    return {
      batchId: String(row.id),
      productId: String(row.product_id),
      productName,
      storeId: row.store_id != null ? String(row.store_id) : null,
      lotNumber: row.lot_number != null ? String(row.lot_number) : null,
      expiryDate: expiry,
      quantity: Math.max(0, Math.floor(Number(row.quantity ?? 0))),
      daysLeft,
    };
  });
}

export async function fetchExpirySummary(
  companyId: string,
  soonDays: number = EXPIRY_SOON_DAYS,
): Promise<ExpirySummary> {
  const supabase = createClient();
  const today = new Date();
  const soon = new Date(today);
  soon.setDate(soon.getDate() + soonDays);
  const soonIso = soon.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("product_batches")
    .select("product_id, lot_number, expiry_date, quantity, product:products(name)")
    .eq("company_id", companyId)
    .gt("quantity", 0)
    .not("expiry_date", "is", null)
    .lte("expiry_date", soonIso)
    .order("expiry_date", { ascending: true });
  if (error) throw error;

  const todayIso = today.toISOString().slice(0, 10);
  let expiredCount = 0;
  let expiringSoonCount = 0;
  let expiredQuantity = 0;
  let expiringSoonQuantity = 0;
  const items: ExpirySummary["items"] = [];

  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const expiry = String(row.expiry_date);
    const qty = Math.max(0, Math.floor(Number(row.quantity ?? 0)));
    const productRaw = row.product;
    const productName = Array.isArray(productRaw)
      ? String((productRaw[0] as { name?: string } | undefined)?.name ?? "—")
      : String((productRaw as { name?: string } | null)?.name ?? "—");
    const daysLeft = Math.round(
      (new Date(expiry).getTime() - new Date(todayIso).getTime()) / 86_400_000,
    );
    if (expiry < todayIso) {
      expiredCount += 1;
      expiredQuantity += qty;
    } else {
      expiringSoonCount += 1;
      expiringSoonQuantity += qty;
    }
    if (items.length < 8) {
      items.push({
        productId: String(row.product_id),
        productName,
        lotNumber: row.lot_number != null ? String(row.lot_number) : null,
        expiryDate: expiry,
        quantity: qty,
        daysLeft,
      });
    }
  }

  return {
    expiredCount,
    expiringSoonCount,
    expiredQuantity,
    expiringSoonQuantity,
    items,
  };
}
