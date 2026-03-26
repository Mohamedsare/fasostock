"use client";

import { enqueueOutbox } from "@/lib/db/dexie-db";
import { createClient } from "@/lib/supabase/client";
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

  return {
    saleId: id,
    saleNumber: String((saleRow as { sale_number?: string } | null)?.sale_number ?? id),
  };
}
