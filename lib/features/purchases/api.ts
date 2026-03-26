"use client";

import { enqueueOutbox } from "@/lib/db/dexie-db";
import { listProducts } from "@/lib/features/products/api";
import { firstProductImageUrl } from "@/lib/features/products/product-images";
import { createClient } from "@/lib/supabase/client";
import type {
  PurchaseDetail,
  PurchaseItemInput,
  PurchaseListItem,
  PurchaseStatus,
  SupplierLite,
} from "./types";

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function listSuppliers(companyId: string): Promise<SupplierLite[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("company_id", companyId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: String((r as { id: string }).id),
    name: String((r as { name: string }).name ?? ""),
  }));
}

export async function listPurchases(params: {
  companyId: string;
  storeId: string | null;
  supplierId: string | null;
  status: PurchaseStatus | null;
  /** Si les deux sont définis, filtre `created_at` (sinon liste complète — Flutter `fromDate`/`toDate` null). */
  from?: string | null;
  to?: string | null;
}): Promise<PurchaseListItem[]> {
  const supabase = createClient();

  let q = supabase
    .from("purchases")
    .select(
      "id, company_id, store_id, supplier_id, reference, status, total, created_at, updated_at, store:stores(name), supplier:suppliers(name)",
    )
    .eq("company_id", params.companyId)
    .order("created_at", { ascending: false });

  if (params.from && params.to) {
    const fromIso = `${params.from}T00:00:00.000Z`;
    const toIso = `${params.to}T23:59:59.999Z`;
    q = q.gte("created_at", fromIso).lte("created_at", toIso);
  }

  if (params.storeId) q = q.eq("store_id", params.storeId);
  if (params.supplierId) q = q.eq("supplier_id", params.supplierId);
  if (params.status) q = q.eq("status", params.status);

  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []).map((row) => {
    const storeRaw = (row as unknown as { store?: { name?: string } | { name?: string }[] })
      .store;
    const supplierRaw = (
      row as unknown as { supplier?: { name?: string } | { name?: string }[] }
    ).supplier;
    const storeName = Array.isArray(storeRaw)
      ? String(storeRaw[0]?.name ?? "")
      : String(storeRaw?.name ?? "");
    const supplierName = Array.isArray(supplierRaw)
      ? String(supplierRaw[0]?.name ?? "")
      : String(supplierRaw?.name ?? "");

    return {
      id: String((row as { id: string }).id),
      companyId: String((row as { company_id: string }).company_id),
      storeId: String((row as { store_id: string }).store_id),
      storeName,
      supplierId: String((row as { supplier_id: string }).supplier_id),
      supplierName,
      reference: ((row as { reference?: string | null }).reference ?? null) as string | null,
      status: String((row as { status: string }).status) as PurchaseStatus,
      total: toNum((row as { total: unknown }).total),
      createdAt: String((row as { created_at: string }).created_at),
      updatedAt: String((row as { updated_at: string }).updated_at),
    };
  });
}

export async function getPurchaseDetail(purchaseId: string): Promise<PurchaseDetail> {
  const supabase = createClient();
  const { data: pRow, error: pErr } = await supabase
    .from("purchases")
    .select(
      "id, company_id, store_id, supplier_id, reference, status, total, created_at, updated_at, store:stores(name), supplier:suppliers(name)",
    )
    .eq("id", purchaseId)
    .single();
  if (pErr) throw pErr;

  const storeRaw = (pRow as unknown as { store?: { name?: string } | { name?: string }[] })
    .store;
  const supplierRaw = (
    pRow as unknown as { supplier?: { name?: string } | { name?: string }[] }
  ).supplier;
  const storeName = Array.isArray(storeRaw)
    ? String(storeRaw[0]?.name ?? "")
    : String(storeRaw?.name ?? "");
  const supplierName = Array.isArray(supplierRaw)
    ? String(supplierRaw[0]?.name ?? "")
    : String(supplierRaw?.name ?? "");

  const { data: iRows, error: iErr } = await supabase
    .from("purchase_items")
    .select("id, product_id, quantity, unit_price, total, product:products(name)")
    .eq("purchase_id", purchaseId)
    .order("created_at", { ascending: true });
  if (iErr) throw iErr;

  const items = (iRows ?? []).map((r) => {
    const productRaw = (
      r as unknown as { product?: { name?: string } | { name?: string }[] }
    ).product;
    const productName = Array.isArray(productRaw)
      ? String(productRaw[0]?.name ?? "")
      : String(productRaw?.name ?? "");
    return {
      id: String((r as { id: string }).id),
      productId: String((r as { product_id: string }).product_id),
      productName,
      quantity: Math.trunc(toNum((r as { quantity: unknown }).quantity)),
      unitPrice: toNum((r as { unit_price: unknown }).unit_price),
      total: toNum((r as { total: unknown }).total),
    };
  });

  return {
    id: String((pRow as { id: string }).id),
    companyId: String((pRow as { company_id: string }).company_id),
    storeId: String((pRow as { store_id: string }).store_id),
    storeName,
    supplierId: String((pRow as { supplier_id: string }).supplier_id),
    supplierName,
    reference: ((pRow as { reference?: string | null }).reference ?? null) as string | null,
    status: String((pRow as { status: string }).status) as PurchaseStatus,
    total: toNum((pRow as { total: unknown }).total),
    createdAt: String((pRow as { created_at: string }).created_at),
    updatedAt: String((pRow as { updated_at: string }).updated_at),
    items,
  };
}

export async function createDraftPurchase(params: {
  companyId: string;
  storeId: string;
  supplierId: string;
  reference: string | null;
  items: PurchaseItemInput[];
  /** Aligné `CreatePurchasePaymentInput` (Flutter). */
  payments?: { method: string; amount: number }[] | null;
}): Promise<string> {
  const total = params.items.reduce(
    (acc, it) => acc + Math.max(0, Math.trunc(it.quantity)) * Math.max(0, toNum(it.unitPrice)),
    0,
  );

  const supabase = createClient();

  const referenceFinal =
    params.reference?.trim() && params.reference.trim().length > 0
      ? params.reference.trim()
      : `A-${Date.now()}`;

  if (!navigator.onLine) {
    await enqueueOutbox("purchase_create_draft", { ...params, total, reference: referenceFinal });
    return "offline";
  }

  const {
    data: { user },
    error: uErr,
  } = await supabase.auth.getUser();
  if (uErr) throw uErr;
  if (!user) throw new Error("Non authentifié");

  const { data: pRow, error: pErr } = await supabase
    .from("purchases")
    .insert({
      company_id: params.companyId,
      store_id: params.storeId,
      supplier_id: params.supplierId,
      reference: referenceFinal,
      status: "draft",
      total,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (pErr) throw pErr;
  const purchaseId = String((pRow as { id: string }).id);

  if (params.items.length > 0) {
    const { error: iErr } = await supabase.from("purchase_items").insert(
      params.items.map((it) => ({
        purchase_id: purchaseId,
        product_id: it.productId,
        quantity: Math.trunc(it.quantity),
        unit_price: toNum(it.unitPrice),
        total: Math.trunc(it.quantity) * toNum(it.unitPrice),
      })),
    );
    if (iErr) throw iErr;
  }

  const pays = params.payments?.filter((p) => p.amount > 0) ?? [];
  if (pays.length > 0) {
    const paidAt = new Date().toISOString();
    const { error: payErr } = await supabase.from("purchase_payments").insert(
      pays.map((p) => ({
        purchase_id: purchaseId,
        amount: p.amount,
        method: p.method,
        paid_at: paidAt,
      })),
    );
    if (payErr) throw payErr;
  }

  return purchaseId;
}

/** Aligné `PurchasesRepository.update` — brouillon, référence uniquement. */
export async function updatePurchaseDraftReference(
  purchaseId: string,
  reference: string | null,
): Promise<void> {
  const supabase = createClient();
  const { data: row, error: selErr } = await supabase
    .from("purchases")
    .select("status")
    .eq("id", purchaseId)
    .single();
  if (selErr) throw selErr;
  if (String((row as { status?: string }).status) !== "draft") {
    throw new Error("Seuls les brouillons peuvent être modifiés");
  }
  const { error } = await supabase
    .from("purchases")
    .update({ reference: reference?.trim() || null })
    .eq("id", purchaseId);
  if (error) throw error;
}

export async function confirmPurchaseWithStock(purchaseId: string): Promise<void> {
  const supabase = createClient();

  if (!navigator.onLine) {
    await enqueueOutbox("purchase_confirm_with_stock", { purchaseId });
    return;
  }

  const {
    data: { user },
    error: uErr,
  } = await supabase.auth.getUser();
  if (uErr) throw uErr;
  if (!user) throw new Error("Non authentifié");

  const { error } = await supabase.rpc("confirm_purchase_with_stock", {
    p_purchase_id: purchaseId,
    p_created_by: user.id,
  });
  if (error) throw error;
}

export async function cancelPurchase(purchaseId: string): Promise<void> {
  const supabase = createClient();

  if (!navigator.onLine) {
    await enqueueOutbox("purchase_cancel", { purchaseId });
    return;
  }

  const { data: row, error: selErr } = await supabase
    .from("purchases")
    .select("status")
    .eq("id", purchaseId)
    .single();
  if (selErr) throw selErr;
  if (String((row as { status?: string }).status) !== "draft") {
    throw new Error("Seuls les brouillons peuvent être annulés");
  }

  const { error } = await supabase
    .from("purchases")
    .update({ status: "cancelled" })
    .eq("id", purchaseId);
  if (error) throw error;
}

/** Aligné `PurchasesRepository.delete` (Flutter) — brouillon uniquement. */
export async function deleteDraftPurchase(purchaseId: string): Promise<void> {
  const supabase = createClient();

  const { data: row, error: selErr } = await supabase
    .from("purchases")
    .select("status")
    .eq("id", purchaseId)
    .single();
  if (selErr) throw selErr;
  if (String((row as { status?: string }).status) !== "draft") {
    throw new Error("Seuls les brouillons peuvent être supprimés");
  }

  const { error } = await supabase.from("purchases").delete().eq("id", purchaseId);
  if (error) throw error;
}

export async function listProductsForPicker(companyId: string) {
  const products = await listProducts(companyId);
  return products
    .filter((p) => {
      if (!p.is_active) return false;
      const scope = p.product_scope ?? "both";
      return scope === "both" || scope === "boutique_only";
    })
    .map((p) => ({
      id: p.id,
      name: p.name,
      unit: p.unit ?? "pce",
      purchasePrice: toNum(p.purchase_price),
      imageUrl: firstProductImageUrl(p),
    }));
}

