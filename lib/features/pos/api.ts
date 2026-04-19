"use client";

import { enqueueOutbox } from "@/lib/db/dexie-db";
import { notifyCompanyOwnersPush } from "@/lib/features/push/company-owners-push-client";
import { createClient } from "@/lib/supabase/client";
import { toastInfo } from "@/lib/toast";
import { listCategories, listProducts, listStoreInventory } from "@/lib/features/products/api";
import { listCustomers } from "@/lib/features/customers/api";
import { listStores } from "@/lib/features/stores/api";
import type { Customer } from "@/lib/features/customers/types";
import type { ProductCategory, ProductItem } from "@/lib/features/products/types";
import type { Store } from "@/lib/features/stores/types";

export type PosData = {
  store: Store | null;
  products: ProductItem[];
  categories: ProductCategory[];
  customers: Customer[];
  stockByProductId: Map<string, number>;
};

export async function fetchPosData(params: {
  companyId: string;
  storeId: string;
  withCustomers: boolean;
}): Promise<PosData> {
  const [stores, products, categories, stockByProductId, customers] = await Promise.all([
    listStores(params.companyId),
    listProducts(params.companyId),
    listCategories(params.companyId),
    listStoreInventory(params.storeId),
    params.withCustomers ? listCustomers(params.companyId) : Promise.resolve([]),
  ]);
  const store = stores.find((s) => s.id === params.storeId) ?? null;
  return { store, products, categories, customers, stockByProductId };
}

export async function createPosSale(params: {
  companyId: string;
  storeId: string;
  customerId: string | null;
  items: Array<{ productId: string; quantity: number; unitPrice: number }>;
  discount: number;
  payments: Array<{ method: "cash" | "mobile_money" | "card" | "other"; amount: number; reference?: string | null }>;
  saleMode: "quick_pos" | "invoice_pos";
  documentType: "thermal_receipt" | "a4_invoice";
}): Promise<{ saleId: string; saleNumber: string }> {
  const supabase = createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  if (!user) throw new Error("Utilisateur non authentifie.");

  const clientRequestId = crypto.randomUUID();

  if (!navigator.onLine) {
    await enqueueOutbox("pos_sale_create", {
      companyId: params.companyId,
      storeId: params.storeId,
      customerId: params.customerId,
      items: params.items,
      discount: params.discount,
      payments: params.payments,
      saleMode: params.saleMode,
      documentType: params.documentType,
      p_client_request_id: clientRequestId,
    });
    return {
      saleId: `offline:${clientRequestId}`,
      saleNumber: "Hors ligne — en attente sync",
    };
  }

  const { data: saleId, error } = await supabase.rpc("create_sale_with_stock", {
    p_company_id: params.companyId,
    p_store_id: params.storeId,
    p_customer_id: params.customerId,
    p_created_by: user.id,
    p_items: params.items.map((i) => ({
      product_id: i.productId,
      quantity: Math.trunc(i.quantity),
      unit_price: i.unitPrice,
      discount: 0,
    })),
    p_payments: params.payments.map((p) => ({
      method: p.method,
      amount: p.amount,
      reference: p.reference ?? null,
    })),
    p_discount: params.discount,
    p_sale_mode: params.saleMode,
    p_document_type: params.documentType,
    p_client_request_id: clientRequestId,
  });
  if (error) throw error;

  const id = String(saleId ?? "");
  if (!id) throw new Error("Vente non creee.");

  const { data: saleRow, error: sErr } = await supabase
    .from("sales")
    .select("sale_number")
    .eq("id", id)
    .maybeSingle();
  if (sErr) throw sErr;

  const saleNumber = String((saleRow as { sale_number?: string } | null)?.sale_number ?? id);
  const subtotal = params.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const total = Math.max(0, subtotal - params.discount);
  const pushSale = await notifyCompanyOwnersPush({
    companyIds: [params.companyId],
    title: "Nouvelle vente",
    body: `${saleNumber} · total ${total.toLocaleString("fr-FR")} FCFA`,
    url: "/sales",
  });
  if (
    pushSale.ok &&
    (pushSale.pushDeviceCount ?? 0) === 0 &&
    (pushSale.ownerUserCount ?? 0) > 0
  ) {
    toastInfo(
      "Push : aucun appareil enregistré pour les propriétaires. Sur le téléphone du owner : Paramètres → Notifications sur cet appareil → Activer.",
      10_000,
    );
  } else if (!pushSale.ok && pushSale.error) {
    toastInfo(`Push non envoyé : ${pushSale.error}`, 8000);
  }

  const stockoutNames: string[] = [];
  for (const it of params.items) {
    const { data: inv, error: invErr } = await supabase
      .from("store_inventory")
      .select("quantity, product:products(name)")
      .eq("store_id", params.storeId)
      .eq("product_id", it.productId)
      .maybeSingle();
    if (invErr || !inv) continue;
    const qty = Number((inv as { quantity?: unknown }).quantity ?? 0);
    if (qty <= 0) {
      const pr = (inv as { product?: { name?: string } | { name?: string }[] }).product;
      const nm = Array.isArray(pr) ? pr[0]?.name : pr?.name;
      stockoutNames.push(String(nm ?? "Produit").trim() || "Produit");
    }
  }
  if (stockoutNames.length > 0) {
    await notifyCompanyOwnersPush({
      companyIds: [params.companyId],
      title: "Rupture de stock",
      body:
        stockoutNames.length === 1
          ? `${stockoutNames[0]} est en rupture dans cette boutique.`
          : `Ruptures : ${stockoutNames.join(", ")}.`,
      url: "/inventory",
    });
  }

  return {
    saleId: id,
    saleNumber,
  };
}

/** RPC `update_completed_sale_with_stock` — aligné `SalesRepository.updateCompleted` (Flutter). */
export async function updateCompletedPosSale(params: {
  saleId: string;
  customerId: string | null;
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    discount: number;
  }>;
  discount: number;
  payments: Array<{
    method: "cash" | "mobile_money" | "card" | "other";
    amount: number;
    reference?: string | null;
  }>;
  saleMode: "quick_pos" | "invoice_pos";
  documentType: "thermal_receipt" | "a4_invoice";
}): Promise<void> {
  if (!navigator.onLine) {
    throw new Error("La modification nécessite une connexion internet.");
  }
  const supabase = createClient();
  const { error } = await supabase.rpc("update_completed_sale_with_stock", {
    p_sale_id: params.saleId,
    p_customer_id: params.customerId,
    p_items: params.items.map((i) => ({
      product_id: i.productId,
      quantity: Math.trunc(i.quantity),
      unit_price: i.unitPrice,
      discount: i.discount,
    })),
    p_payments: params.payments.map((p) => ({
      method: p.method,
      amount: p.amount,
      reference: p.reference ?? null,
    })),
    p_discount: params.discount,
    p_sale_mode: params.saleMode,
    p_document_type: params.documentType,
  });
  if (error) throw error;
}
